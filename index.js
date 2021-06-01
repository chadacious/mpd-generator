var queue = require('queue');
const { shInfo, shSpawn, getResolution } = require('./utils');
const path = require('path');
const fs = require('fs');

var q = queue({
    concurrency: 1
});

/**
 * 
 * @param {*} data 
 * 
 * data={
 * path: "public/0x01A58",
 * inputFile: "0x01A58",
 * format: ".mkv",
 * resolutions: [], //['720p', '480p', '360p', '240p', '144p']
 * qualities: [], //Bitrates ['low', 'medium', 'high']
 * notification: emiter
 * }
 */

function main(data) {
    q.push(async function (cb) {
        await generate(data)
        cb()
    })
    q.start(function (err) {
        if (err) throw err
    })
}

/**
 * 
 * @param {*} data 
 * 
 * data={
 * path: "public/0x01A58",
 * inputFile: "0x01A58",
 * format: ".mkv",
 * resolutions: [], //['720p', '480p', '360p', '240p', '144p']
 * qualities: [], //Bitrates ['low', 'medium', 'high']
 * notification: emiter
 * }
 */

async function generate(data) {

    var width = 0;
    var height = 0;
    var bitrate = [];

    var resolution = [];
    let qualities = ['low', 'medium', 'high'];

    let dir = data.path;
    if (!dir.endsWith('/')) {
        dir += '/';
    }
    let inputFile = data.inputFile;
    let outputFile = data.inputFile;
    let horizontal = true;
    let formatOrigin = data.format;
    let format = '.mp4';

    //%
    let percent = 0;
    let count = 0;
    let step = 3;

    //info video file
    let widthInitial = 0;
    let heightInitial = 0;
    let frames;
    let videos = [];
    let fileToDelete = [];

    await shInfo(path.resolve(dir + inputFile + formatOrigin))
        .then(function (response) {
            widthInitial = parseInt(response.width, 10);
            heightInitial = parseInt(response.height, 10);
            frames = response.frames;
        })
        .catch(err => console.log(err));

    /**
     * Verificando si es vertical u horizontal
     */
    if (heightInitial > widthInitial) {
        horizontal = false;
    }

    if (data.resolutions && data.resolutions.length > 0) {
        //Limitando la resolucion a 720p maximo
        for (let i = 0; i < data.resolutions.length; i++) {
            let x = data.resolutions[i];
            if (horizontal) {
                if (heightInitial >= 360 && heightInitial < 470 && ['360p', '240p', '144p'].includes(x)) {
                    resolution.push(x);
                } else if (heightInitial >= 470 && heightInitial < 710 && ['480p', '360p', '240p', '144p'].includes(x)) {
                    resolution.push(x);
                } else if (heightInitial >= 710 && ['720p', '480p', '360p', '240p', '144p'].includes(x)) {
                    resolution.push(x);
                }
            } else {
                if (widthInitial >= 360 && widthInitial < 470 && ['360p', '240p', '144p'].includes(x)) {
                    resolution.push(x);
                } else if (widthInitial >= 470 && widthInitial < 710 && ['480p', '360p', '240p', '144p'].includes(x)) {
                    resolution.push(x);
                } else if (widthInitial >= 710 && ['720p', '480p', '360p', '240p', '144p'].includes(x)) {
                    resolution.push(x);
                }
            }
        }
    }

    if (data.resolutions && data.resolutions.length == 0 || resolution.length == 0) {
        /**
         * Se verifica en que resoluciones se
         * convertira partiendo de la original
         */
        if (horizontal) {
            if (heightInitial >= 360 && heightInitial < 470) {
                resolution = ['360p', '240p', '144p'];
            } else if (heightInitial >= 470 && heightInitial < 710) {
                resolution = ['480p', '360p', '240p', '144p'];
            } else if (heightInitial >= 710) {
                resolution = ['720p', '480p', '360p', '240p', '144p'];
            }
        } else {
            if (widthInitial >= 360 && widthInitial < 470) {
                resolution = ['360p', '240p', '144p'];
            } else if (widthInitial >= 470 && widthInitial < 710) {
                resolution = ['480p', '360p', '240p', '144p'];
            } else if (widthInitial >= 710) {
                resolution = ['720p', '480p', '360p', '240p', '144p'];
            }
        }
    }

    /**
     * Asignando las calidaddes 
     */
    if ((data.qualities || []).length > 0) {
        qualities = data.qualities;
    }

    /**
     * Los pasos son por cada resolucion y cada calidad dos videos
     */
    step += resolution.length * qualities.length * 2;

    /**
     * Comando para ejecutar la creacion del manifiesto
     * a este array se le anadira las partes de los videos, 
     * audios y subtitulos que faltan.
     */

    var arrayMpd = [
        '--mpd-name=manifest.mpd',
        '-o', dir + 'mpd/'
    ];


    /**
     * Siguiendo a Youtbe https://support.google.com/youtube/answer/2853702?hl=en
     * 
     * fps:30
     * 
     * Por ahora todo esta x el recomendado de lo que se muestra a continuacion
     *  
                        144p        240p       360p        480p        720p        1080p
        Resolution      256x144    426 x 240   640 x 360   854x480     1280x720    1920x1080
        Video Bitrates                   
        Maximum         100Kbs     700 Kbps    1000 Kbps   2000 Kbps   4000 Kbps   6000 Kbps
        Recommended     90Kbs      400 Kbps    750 Kbps    1000 Kbps   2500 Kbps   4500 Kbps
        Minimum         80Kbs      300 Kbps    400 Kbps    500 Kbps    1500 Kbps   3000 Kbps
     */

    for (var i = 0; i < resolution.length; i++) {
        var resolutionX = resolution[i];
        let a = getResolution(widthInitial, heightInitial, resolutionX, qualities);
        width = a.width;
        height = a.height;
        bitrate = a.bitrate;

        //#region llenamos este video para luego crear los ficheros download 
        let bit = bitrate[0];
        if (qualities.includes('medium')) {
            bit = bitrate.filter(x => { return x.type == 'medium' })[0];
        }
        videos.push({
            path: path.resolve(dir + 'f-' + outputFile + '_' + resolutionX + '_' + bit.value + format),
            name: outputFile + '_' + resolutionX + format
        });
        //#endregion

        /**
         * Recorremos los bitrate, para convertir los videos
         */
        for (var j = 0; j < bitrate.length; j++) {
            let convertFlag = false;
            let convertMp4 = false;
            /**
            * Vamos a probar convertir un video
            * Manteniendo el ancho
            * 
            * resize:width=720,fittobox=width
            * 
            * Se crea el .264 desde el formatio original en las 
            * diferentes resoluciones
            */
            await shSpawn('ffmpeg', [
                '-i',
                path.resolve(dir + inputFile + formatOrigin),
                '-an', '-sn', '-c:0', 'libx264', '-x264opts',
                'keyint=24:min-keyint=24:no-scenecut',
                '-b:v', bitrate[j].value * 2 + 'k', '-maxrate', bitrate[j].value * 2 + 'k',
                '-bufsize', bitrate[j].value + 'k', '-vf', 'scale=' + width + ':' + height,
                path.resolve(dir + outputFile + '_' + resolutionX + '_' + bitrate[j].value + format),
            ], frames)
                .then(function (response) {
                    if (response == 0) {
                        convertFlag = true;
                        count++;
                        percent = parseInt(count * 100 / step);
                        if (data.notification) {
                            data.notification.emit('progressVideoConvert', {
                                uuid: data.inputFile,
                                value: percent
                            });
                        }
                        fileToDelete.push(path.resolve(dir + outputFile + '_' + resolutionX + '_' + bitrate[j].value + format));
                    }
                })
                .catch(err => console.log(err));

            if (convertFlag) {
                /**
                 * 
                 * Se genere el mp4 desde el .264 creado anteriormente
                 * 
                 */
                await shSpawn('mp4fragment', [
                    path.resolve(dir + outputFile + '_' + resolutionX + '_' + bitrate[j].value + format),
                    path.resolve(dir + 'f-' + outputFile + '_' + resolutionX + '_' + bitrate[j].value + format)
                ])
                    .then(function (response) {
                        if (response == 0) {
                            convertMp4 = true;
                            count++;
                            percent = parseInt(count * 100 / step);
                            if (data.notification) {
                                data.notification.emit('progressVideoConvert', {
                                    uuid: data.inputFile,
                                    value: percent
                                });
                            }
                            fileToDelete.push(path.resolve(dir + 'f-' + outputFile + '_' + resolutionX + '_' + bitrate[j].value + format));
                        }
                    })
                    .catch(err => console.log(err));
                if (convertMp4) {
                    arrayMpd.push(path.resolve(dir + 'f-' + outputFile + '_' + resolutionX + '_' + bitrate[j].value + format));
                }
            }
        }
    }

    /**
     * 
     * Se saca el audio desde el original
     * 
     */
    await shSpawn('ffmpeg', [
        '-i',
        path.resolve(dir + inputFile + formatOrigin),
        '-map', '0:1', '-ac', '2', '-ab', '192k', '-vn', '-sn',
        path.resolve(dir + outputFile + '_audio' + format),
    ])
        .then(() => {
            count++;
            percent = parseInt(count * 100 / step);
            if (data.notification) {
                data.notification.emit('progressVideoConvert', {
                    uuid: data.inputFile,
                    value: percent
                });
            }
            fileToDelete.push(path.resolve(dir + outputFile + '_audio' + format));
        })
        .catch(err => console.log(err));

    /**
     * Se crea el mp4 desde el 264 del audio
     */
    await shSpawn('mp4fragment', [
        path.resolve(dir + outputFile + '_audio' + format),

        path.resolve(dir + 'f-' + outputFile + '_audio' + format)
    ])
        .then(async response => {
            if (response == 0) {
                count++;
                percent = parseInt(count * 100 / step);
                if (data.notification) {
                    data.notification.emit('progressVideoConvert', {
                        uuid: data.inputFile,
                        value: percent
                    });
                }
                fileToDelete.push(path.resolve(dir + 'f-' + outputFile + '_audio' + format));
            }
        })
    arrayMpd.push(path.resolve(dir + 'f-' + outputFile + '_audio' + format));

    //Se crea el mpd
    await shSpawn('mp4dash', arrayMpd)
        .then(function (response) {
            if (response == 0) {
                fs.readFile(dir + 'mpd/manifest.mpd', 'utf-8', function (err, dataFile) {
                    if (err) throw err;
                    count++;
                    percent = parseInt(count * 100 / step);
                    if (data.notification) {
                        data.notification.emit('progressVideoConvert', {
                            uuid: data.inputFile,
                            value: percent,
                            qualities: qualities,
                            resolutions: resolution
                        });
                    }
                    var newValue = dataFile.replace(/initialization="/g, 'initialization="' + outputFile + '_');
                    newValue = newValue.replace(/ media="/g, ' media="' + outputFile + '_');
                    fs.writeFile(dir + 'mpd/' + outputFile + '.mpd', newValue, 'utf-8', function (err) {
                        if (err) throw err;
                        console.log('filelistAsync complete');
                    });
                });
            }
        })
        .catch(err => console.log(err));


    /**
     * Ahora generaremos los ficheros para descargar
     */

    /** 
    *
    * Se saca el audio desde el original
    */
    await shSpawn('ffmpeg', [
        '-i',
        path.resolve(dir + inputFile + formatOrigin),
        '-map', '0:1', '-ac', '2', '-ab', '192k', '-vn', '-sn',
        path.resolve(dir + outputFile + '_audio' + '.mp3'),
    ]).catch(err => console.log(err));
    fileToDelete.push(path.resolve(dir + outputFile + '_audio' + '.mp3'));
    await shSpawn('mkdir', [
        dir + 'download'
    ]).catch(err => console.log(err));

    for (let i = 0; i < videos.length; i++) {
        await shSpawn('ffmpeg', [
            '-i',
            videos[i].path,
            '-i',
            path.resolve(dir + outputFile + '_audio' + '.mp3'),
            '-c', 'copy', '-map', '0:v:0', '-map', '1:a:0',
            path.resolve(dir + 'download/' + videos[i].name),
        ]).catch(err => console.log(err));
        fileToDelete.push(path.resolve(dir + 'download/' + videos[i].name));
        //comprimo el download
        await shSpawn('zip', [
            '-j',
            path.resolve(dir + 'download/' + videos[i].name + '.zip'),
            path.resolve(dir + 'download/' + videos[i].name),
        ]).catch(err => console.log(err));
    }
    for (let i = 0; i < fileToDelete.length; i++) {
        await shSpawn('rm', [fileToDelete[i]]).catch(err => console.log(err));
    }
}

module.exports = {
    main
};

