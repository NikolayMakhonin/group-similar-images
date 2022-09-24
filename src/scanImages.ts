import globby from 'globby'
import {Pool, PoolRunner} from '@flemist/time-limits'
import sharp from 'sharp'
import {Color, ColorStat, Image, ImageFileGroupItem, ImageFileStat} from 'src/contracts'
import fse from 'fs/promises'
import path from 'path'
import * as quantizer from 'image-q'

const IMAGE_SQUARE = 32 * 32
const COLOR_COUNT_PER_CHANNEL = 16
const MAX_DIFF = 0.00007

const colorDiffMax = getColorDiff([0, 0, 0], [255, 255, 255])
function getColorDiff(color1: Color, color2: Color) {
  return Math.sqrt(
    (color1[0] - color2[0]) ** 2
    + (color1[1] - color2[1]) ** 2
    + (color1[2] - color2[2]) ** 2,
  )
}
function getColorSimilarity(color1: Color, color2: Color) {
  return 1 - getColorDiff(color1, color2) / colorDiffMax
}

function calcColorStats({
  data,
  width,
  height,
}: Image): ColorStat[] {
  const colorStat = new Map<number, ColorStat>()
  const pixelCount = width * height

  const pixelData = new Uint32Array(data.buffer)

  function addColorStat(color: Color) {
    const [R, G, B] = color

    const divR = Math.floor(R / stepColor)
    const divG = Math.floor(G / stepColor)
    const divB = Math.floor(B / stepColor)
    const modR = (R % stepColor) / stepColor
    const modG = (G % stepColor) / stepColor
    const modB = (B % stepColor) / stepColor

    const colorIndex = divR
      + COLOR_COUNT_PER_CHANNEL * divG
      + (COLOR_COUNT_PER_CHANNEL ** 2) * divB
    //
    // const item = colorStat.get(colorIndex)
    // if (!item) {
    //   colorStat.set(colorIndex, {
    //     color: [divR * stepColor, divG * stepColor, divB * stepColor],
    //     value: 1,
    //   })
    // }
    // else {
    //   item.value++
    // }

    for (let r = 0; r < 2; r++) {
      const coefR = r === 0 ? 1 - modR : modR
      for (let g = 0; g < 2; g++) {
        const coefG = g === 0 ? 1 - modG : modG
        for (let b = 0; b < 2; b++) {
          const coefB = b === 0 ? 1 - modB : modB
          const colorIndex = (divR + r)
            + COLOR_COUNT_PER_CHANNEL * (divG + g)
            + (COLOR_COUNT_PER_CHANNEL ** 2) * (divB + b)
          const value = coefR * coefG * coefB // * coefX * coefY
          const item = colorStat.get(colorIndex)
          if (!item) {
            colorStat.set(colorIndex, {
              color: [(divR + r) * stepColor, (divG + g) * stepColor, (divB + b) * stepColor],
              value,
            })
          }
          else {
            item.value += value
          }
        }
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const index = y * width + x
      const pixel = pixelData[index]
      const item = colorStat.get(pixel)
      if (!item) {
        colorStat.set(pixel, {
          color: new Uint8Array,
          value,
        })
      }
      else {
        item.value += value
      }
    }
  }

  const colorStatArr = Array.from(colorStat.values())
  colorStatArr.length = Math.min(colorStatArr.length, 128)

  const coef = IMAGE_SQUARE / pixelCount
  for (let i = 0, len = colorStatArr.length; i < len; i++) {
    colorStatArr[i].value *= coef
  }

  return colorStatArr
}

function calcColorStatsDiff(stat1: ColorStat[], stat2: ColorStat[]): number {
  let sumSqr: number = 0
  let count: number = 0

  const len1 = stat1.length
  const len2 = stat2.length
  for (let i1 = 0; i1 < len1; i1++) {
    const {color: color1, value: value1} = stat1[i1]
    for (let i2 = i1; i2 < len2; i2++) {
      const {color: color2, value: value2} = stat2[i2]
      const weight = getColorSimilarity(color1, color2)
      sumSqr = (value1 - value2) ** 2
      count += weight
    }
  }

  return sumSqr / count
}

function groupImages({
  imageFileStats,
  maxDiff,
}: {
  imageFileStats: ImageFileStat[],
  maxDiff: number,
}): ImageFileGroupItem[][] {
  imageFileStats = imageFileStats.slice()
  const groupRemaining: ImageFileGroupItem[] = []
  const groups: ImageFileGroupItem[][] = []

  for (let i = 0; i < imageFileStats.length; i++) {
    const imageFileStat1 = imageFileStats[i]
    let group: ImageFileGroupItem[]
    let minDiff = 1
    for (let j = i + 1; j < imageFileStats.length; j++) {
      const imageFileStat2 = imageFileStats[j]
      const diff = calcColorStatsDiff(
        imageFileStat1.colorStats,
        imageFileStat2.colorStats,
      )
      if (diff < minDiff) {
        minDiff = diff
      }
      if (diff <= maxDiff) {
        if (group == null) {
          group = [{
            file : imageFileStat1.file,
            diff : 0,
            image: imageFileStat1.image,
          }]
        }
        group.push({
          file : imageFileStat2.file,
          diff,
          image: imageFileStat2.image,
        })
        imageFileStats[j] = imageFileStats[imageFileStats.length - 1]
        imageFileStats.length--
        j--
      }
    }
    if (group == null) {
      groupRemaining.push({
        file : imageFileStat1.file,
        diff : minDiff,
        image: imageFileStat1.image,
      })
    }
    else {
      groups.push(group)
    }
  }

  groups.push(groupRemaining)

  groups.forEach(group => {
    group.sort((o1, o2) => {
      return o1.diff > o2.diff ? 1 : -1
    })
  })

  return groups
}

export async function scanImages({
  filePatterns,
  destDir,
}: {
  filePatterns: string[],
  destDir: string,
}) {
  const files = await globby(filePatterns)

  const poolRunner = new PoolRunner(new Pool(20))

  let readCount = 0
  const imageFileStats = []
  await Promise.all(files.map(async (file) => {
    try {
      const imageFileStat = await poolRunner.run<ImageFileStat>(1, async () => {
        const _sharp = sharp(file)
        const metadata = await _sharp.metadata()

        if (!metadata.width || !metadata.height) {
          throw new Error(`width: ${metadata.width}, height: ${metadata.height}`)
        }

        const aspectRatio = metadata.width / metadata.height
        const h = Math.sqrt(IMAGE_SQUARE / aspectRatio)
        const width = Math.round(h * aspectRatio)
        const height = Math.round(h)

        let data: Uint8Array = await _sharp
          .resize(width, height, {
            kernel: 'lanczos3',
          })
          .toColorspace('srgb')
          .ensureAlpha()
          // docs: https://sharp.pixelplumbing.com/api-output#png
          // .png({
          //   palette         : true,
          //   // quality         : null,
          //   colours         : 8,
          //   colors          : 8,
          //   dither          : 0,
          //   effort          : 7, // 1 - fastest, 10 - slowest
          //   compressionLevel: 0,
          // })
          .raw()
          .toBuffer()

        // const inPointContainer = quantizer.utils.PointContainer.fromImageData({
        //   data      : new Uint8ClampedArray(data.buffer),
        //   width,
        //   height,
        //   colorSpace: 'srgb',
        // })
        // const palette = await quantizer.buildPalette([inPointContainer], {
        //   colorDistanceFormula: 'euclidean',
        //   paletteQuantization : 'neuquant',
        //   colors              : 32,
        // })
        // const outPointContainer = await quantizer.applyPalette(inPointContainer, palette)
        // data = outPointContainer.toUint8Array()

        const image: Image = {
          data,
          channels: 4,
          width,
          height,
        }

        const colorStats = calcColorStats(image)

        readCount++

        if (readCount % 10 === 0) {
          console.log('readCount: ' + readCount + ' / ' + files.length)
        }

        return {
          file,
          colorStats,
          image,
        }
      })

      imageFileStats.push(imageFileStat)
    }
    catch (err) {
      console.error(file + ': ', err)
    }
  }))

  const groups = groupImages({
    imageFileStats,
    maxDiff: MAX_DIFF,
  })

  if (await fse.stat(destDir).catch(() => null)) {
    await fse.rm(destDir, {recursive: true})
  }

  await Promise.all(groups.map(async (group, i) => {
    if (group.length === 0) {
      return
    }

    const dir = path.resolve(destDir, i + '')
    if (!await fse.stat(dir).catch(() => null)) {
      await fse.mkdir(dir, {
        recursive: true,
      })
    }

    const files = new Set<string>()

    return Promise.all(group.map(async ({file, image}) => {
      await poolRunner.run(1, async () => {
        const { name, ext } = path.parse(path.basename(file))
        let destFile = path.resolve(dir, name + ext)

        let i = 1
        while (files.has(destFile)) {
          i++
          destFile = path.join(dir, `${name}-${i}${ext}`)
        }
        files.add(destFile)

        // await fse.copyFile(file, destFile)
        await sharp(image.data, {
          raw: {
            channels: image.channels as any,
            width   : image.width,
            height  : image.height,
          },
        })
          // docs: https://sharp.pixelplumbing.com/api-output#png
          .png({
            // palette         : false,
            // colours         : 128,
            // // colors          : 8,
            // dither          : 0,
            // effort          : 7, // 1 - fastest, 10 - slowest
            compressionLevel: 9,
          })
          .toFile(destFile.replace(/(\.\w+)?$/, '') + '.png')
      })
    }))
  }))

  console.log(groups)
}
