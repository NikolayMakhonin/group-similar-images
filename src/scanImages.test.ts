import {scanImages} from 'src/scanImages'

describe('scanImages', async function () {
  this.timeout(60 * 60 * 1000)

  it('base', async function () {
    await scanImages({
      filePatterns: [
        // 'E:/RemoteData/Mega2/Pictures/ОзВ/__SEND/Old/**/*',
        // 'E:/RemoteData/Mega2/Pictures/ОзВ/**/*.{jpg,bmp,png,gif,jpg,jpeg}',
        // '!E:/RemoteData/Mega2/Pictures/__SEND/**/*',
        // 'E:/Temp/Images/process/**/*.{jpg,bmp,png,gif,jpg,jpeg}',
        'E:/Temp/Images/temp/**/*.{jpg,bmp,png,gif,jpg,jpeg}',
      ],
      destDir: 'E:/Temp/ImageGroups',
    })
  })
})
