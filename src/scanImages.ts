import globby from 'globby'
import {Pool, PoolRunner} from '@flemist/time-limits'
import sharp from 'sharp'
import {Color, ColorStat, Image, ImageFileGroupItem, ImageFileStat} from 'src/contracts'
import fse from 'fs/promises'
import path from 'path'

const REDUCE_IMAGE_SQUARE = 32 * 32
const COLOR_COUNT_PER_CHANNEL = 16
const COUNT_PER_DIMENSION = 2
const MAX_DIFF = 3e-12

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
  channels,
  width,
  height,
}: Image): ColorStat[] {
  if (channels !== 1 && channels !== 3 && channels !== 4) {
    throw new Error(`channels = ${channels}`)
  }

  const stepColor = 256 / (COLOR_COUNT_PER_CHANNEL - 1)
  const stepX = width / (COUNT_PER_DIMENSION - 1)
  const stepY = height / (COUNT_PER_DIMENSION - 1)
  const colorCount = (COLOR_COUNT_PER_CHANNEL ** 3) * (COUNT_PER_DIMENSION ** 2)
  const colorStat = new Map<number, ColorStat>()
  const pixelCount = width * height

  function getRGB(data: Uint8Array, channels: number, index: number): Color {
    const R = data[index]
    const G = channels > 1 ? data[index + 1] : R
    const B = channels > 2 ? data[index + 2] : R
    return [R, G, B]
  }

  function getColorSimilarityByCoord(color0: Color, x: number, y: number) {
    return getColorSimilarity(
      color0,
      getRGB(data, channels, y * width + x),
    )
  }

  function addColorStat(color: Color, X: number, Y: number) {
    const [R, G, B] = color

    const divR = Math.floor(R / stepColor)
    const divG = Math.floor(G / stepColor)
    const divB = Math.floor(B / stepColor)

    const colorIndex = divR
      + COLOR_COUNT_PER_CHANNEL * divG
      + (COLOR_COUNT_PER_CHANNEL ** 2) * divB

    const item = colorStat.get(colorIndex)
    if (!item) {
      colorStat.set(colorIndex, {
        color,
        value: 1,
      })
    }
    else {
      item.value++
    }

    for (let r = 0; r < 2; r++) {
      const coefR = r === 0 ? 1 - modR : modR
      for (let g = 0; g < 2; g++) {
        const coefG = g === 0 ? 1 - modG : modG
        for (let b = 0; b < 2; b++) {
          const coefB = b === 0 ? 1 - modB : modB
          // for (let x = 0; x < 2; x++) {
          //   const coefX = x === 0 ? 1 - modX : modX
          //   for (let y = 0; y < 2; y++) {
          //     const coefY = y === 0 ? 1 - modY : modY
              const colorIndex = (divR + r)
                + COLOR_COUNT_PER_CHANNEL * (divG + g)
                + (COLOR_COUNT_PER_CHANNEL ** 2) * (divB + b)
                // + (COLOR_COUNT_PER_CHANNEL ** 2) * (COUNT_PER_DIMENSION) * (divX + x)
                // + (COLOR_COUNT_PER_CHANNEL ** 2) * (COUNT_PER_DIMENSION ** 2) * (divY + y)
              const value = coefR * coefG * coefB // * coefX * coefY
              const item = colorStat.get(colorIndex)
              if (!item) {
                colorStat.set(colorIndex, {
                  color,
                  value,
                })
              }
              else {
                item.value += value
              }
          //   }
          // }
        }
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const index = y * width + x
      const color = getRGB(data, channels, index)

      // let sumDiff = 0
      // if (x < width - 1) {
      //   sumDiff += getColorSimilarityByCoord(color, x + 1, y)
      //   if (y < height - 1) {
      //     sumDiff += getColorSimilarityByCoord(color, x + 1, y + 1)
      //   }
      // }
      // if (y < height - 1) {
      //   sumDiff += getColorSimilarityByCoord(color, x, y + 1)
      //   if (x > 0) {
      //     sumDiff += getColorSimilarityByCoord(color, x - 1, y + 1)
      //   }
      // }
      // const weight = sumDiff / 4

      addColorStat(color, x, y)
    }
  }

  const colorStatArr = Array.from(colorStat.values())
  colorStatArr.length = Math.min(colorStatArr.length, 128)

  const coef = 1 / pixelCount
  for (let i = 0, len = colorStatArr.length; i < len; i++) {
    colorStatArr[i].value *= coef
  }

  return colorStatArr
}

function calcColorStatsDiff(stat1: ColorStat[], stat2: ColorStat[]): number {
  let sum: number = 0
  let count: number = 0

  const len1 = stat1.length
  const len2 = stat2.length
  for (let i1 = 0; i1 < len1; i1++) {
    const {color: color1, value: value1} = stat1[i1]
    for (let i2 = i1; i2 < len2; i2++) {
      const {color: color2, value: value2} = stat2[i1]
      sum = getColorSimilarity(color1, color2) * value1 * value2
      count++
    }
  }

  return sum / count
}

function groupImages({
  imageFileStats,
  maxDiff,
}: {
  imageFileStats: ImageFileStat[],
  maxDiff: number,
}): ImageFileGroupItem[][] {
  imageFileStats = imageFileStats.slice()
  const groupRemaining = []
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
            file: imageFileStat1.file,
            diff: 0,
          }]
        }
        group.push({
          file: imageFileStat2.file,
          diff,
        })
        imageFileStats[j] = imageFileStats[imageFileStats.length - 1]
        imageFileStats.length--
        j--
      }
    }
    if (group == null) {
      groupRemaining.push({
        file: imageFileStat1.file,
        diff: minDiff,
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
        const h = Math.sqrt(REDUCE_IMAGE_SQUARE / aspectRatio)
        const width = Math.round(h * aspectRatio)
        const height = Math.round(h)

        const buffer = await _sharp
          .resize(width, height)
          .raw()
          .toBuffer()

        const image: Image = {
          data    : buffer,
          channels: metadata.channels,
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

    return Promise.all(group.map(async ({file}) => {
      await poolRunner.run(1, async () => {
        const { name, ext } = path.parse(path.basename(file))
        let destFile = path.resolve(dir, name + ext)

        let i = 1
        while (files.has(destFile)) {
          i++
          destFile = path.join(dir, `${name}-${i}${ext}`)
        }
        files.add(destFile)

        await fse.copyFile(file, destFile)
      })
    }))
  }))

  console.log(groups)
}
