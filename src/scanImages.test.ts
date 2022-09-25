import {calcColorStatsSimilarity, getColorDiff, getColorSimilarity, scanImages} from 'src/scanImages'
import {ColorStat} from 'src/contracts'

describe('scanImages', async function () {
  this.timeout(60 * 60 * 1000)

  it('base', async function () {
    await scanImages({
      filePatterns: [
        // 'E:/RemoteData/Mega2/Pictures/ОзВ/__SEND/Old/**/*',
        // 'E:/RemoteData/Mega2/Pictures/ОзВ/**/*.{jpg,bmp,png,gif,jpg,jpeg}',
        // '!E:/RemoteData/Mega2/Pictures/__SEND/**/*',
        'E:/Temp/Images/process/**/*.{jpg,bmp,png,gif,jpg,jpeg}',
        // 'E:/Temp/Images/temp/many/**/*.{jpg,bmp,png,gif,jpg,jpeg}',
      ],
      destDir: 'E:/Temp/ImageGroups',
    })
  })

  it('calcColorStatsSimilarity', async function () {
    const stat1: ColorStat[] = [
      {
        color: [0, 0, 0],
        value: 1,
      },
      {
        color: [128, 128, 128],
        value: 1,
      },
      {
        color: [255, 255, 255],
        value: 1,
      },
    ]
    const stat2: ColorStat[] = [
      {
        color: [255, 255, 255],
        value: 1,
      },
      {
        color: [0, 0, 0],
        value: 1,
      },
      {
        color: [128, 128, 128],
        value: 1,
      },
    ]
    const stat3: ColorStat[] = [
      {
        color: [0, 0, 0],
        value: 1,
      },
      {
        color: [128, 128, 128],
        value: 1,
      },
      {
        color: [255, 0, 255],
        value: 1,
      },
    ]
    const stat4: ColorStat[] = [
      {
        color: [255, 255, 255],
        value: 0,
      },
      {
        color: [0, 0, 0],
        value: 1,
      },
      {
        color: [128, 128, 128],
        value: 1,
      },
    ]
    console.log(calcColorStatsSimilarity(stat1, stat2))
    console.log(calcColorStatsSimilarity(stat1, stat3))
    console.log(calcColorStatsSimilarity(stat1, stat4))
  })

  it('getColorDiff', async function () {
    const power = 3
    console.log(getColorSimilarity([0, 255, 255], [255, 255, 0]) ** power)
    console.log(getColorSimilarity([0, 255, 255], [255, 0, 255]) ** power)
    console.log(getColorSimilarity([255, 0, 255], [255, 255, 0]) ** power)
    console.log(getColorSimilarity([0, 0, 0], [255, 255, 255]) ** power)
    console.log(getColorSimilarity([0, 0, 0], [128, 128, 128]) ** power)
    console.log(getColorSimilarity([0, 0, 0], [64, 64, 64]) ** power)
    console.log(getColorSimilarity([0, 0, 0], [32, 32, 32]) ** power)
    console.log(getColorSimilarity([0, 0, 0], [16, 16, 16]) ** power)
  })
})
