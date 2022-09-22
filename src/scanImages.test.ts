import {scanImages} from 'src/scanImages'

describe('scanImages', async function () {
  this.timeout(60 * 60 * 1000)

  it('base', async function () {
    await scanImages({
      filePatterns: [
        // 'E:/RemoteData/Mega2/Pictures/**/*.{jpg,bmp,png,gif,jpg,jpeg}',
        'E:/Temp/Images/**/*.{jpg,bmp,png,gif,jpg,jpeg}',
      ],
    })
  })
})
