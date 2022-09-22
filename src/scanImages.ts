import globby from 'globby'
import {Pool, PoolRunner} from '@flemist/time-limits'
import sharp from 'sharp'
import {Image, ImageFileGroupItem, ImageFileStat} from 'src/contracts'

const COLOR_COUNT_PER_CHANNEL = 32

function calcColorIndex(R: number, G: number, B: number, colorStep: number) {
  const reducedR = Math.floor(R / colorStep)
  const reducedG = Math.floor(G / colorStep)
  const reducedB = Math.floor(B / colorStep)

  const colorIndex = reducedR
    + COLOR_COUNT_PER_CHANNEL * reducedG
    + COLOR_COUNT_PER_CHANNEL * COLOR_COUNT_PER_CHANNEL * reducedB

  return colorIndex
}

function calcColorStat({
  data,
  channels,
}: Image): Float32Array {
  if (channels !== 1 && channels !== 3 && channels !== 4) {
    throw new Error(`channels = ${channels}`)
  }

  const colorStep = 256 / (COLOR_COUNT_PER_CHANNEL - 1)
  const colorCount = COLOR_COUNT_PER_CHANNEL ** 3
  const colorStat = new Float32Array(colorCount)
  const len = data.length
  const pixelCount = Math.floor(len / channels)

  for (let i = 0; i < len; i += channels) {
    const R = data[i]
    const G = channels > 1 ? data[i + 1] : R
    const B = channels > 2 ? data[i + 2] : R

    const divR = Math.floor(R / colorStep)
    const divG = Math.floor(G / colorStep)
    const divB = Math.floor(B / colorStep)
    const modR = (R % colorStep) / colorStep
    const modG = (G % colorStep) / colorStep
    const modB = (B % colorStep) / colorStep

    for (let r = 0; r < 2; r++) {
      const coefR = r === 0 ? 1 - modR : modR
      for (let g = 0; g < 2; g++) {
        const coefG = g === 0 ? 1 - modG : modG
        for (let b = 0; b < 2; b++) {
          const coefB = b === 0 ? 1 - modB : modB
          const colorIndex = (divR + r)
            + COLOR_COUNT_PER_CHANNEL * (divG + g)
            + COLOR_COUNT_PER_CHANNEL * COLOR_COUNT_PER_CHANNEL * (divB + b)
          colorStat[colorIndex] += coefR * coefG * coefB
        }
      }
    }
  }

  const coef = 1 / pixelCount
  for (let i = 0; i < colorCount; i++) {
    colorStat[i] *= coef
  }

  return colorStat
}

function calcColorStatsDiff(stat1: Float32Array, stat2: Float32Array): number {
  const len = stat1.length
  if (stat2.length !== len) {
    throw new Error(`stat2.length !== ${len}`)
  }

  let sumSqr: number = 0

  for (let i = 0; i < len; i++) {
    const diffSqr = (stat2[i] - stat1[i]) ** 2
    sumSqr += diffSqr
  }

  return sumSqr / len
}

function groupImages({
  imageFileStats,
  maxDiff,
}: {
  imageFileStats: ImageFileStat[],
  maxDiff: number,
}): ImageFileGroupItem[][] {
  imageFileStats = imageFileStats.slice()
  const len = imageFileStats.length
  const groupRemaining = []
  const groups: ImageFileGroupItem[][] = []

  for (let i = 0; i < imageFileStats.length; i++) {
    const imageFileStat1 = imageFileStats[i]
    let group: ImageFileGroupItem[]
    let minDiff = 1
    for (let j = i + 1; j < imageFileStats.length; j++) {
      const imageFileStat2 = imageFileStats[j]
      const diff = calcColorStatsDiff(
        imageFileStat1.colorStat,
        imageFileStat2.colorStat,
      )
      if (diff < minDiff) {
        minDiff = diff
      }
      if (diff <= maxDiff) {
        if (group == null) {
          group = [{
            file: imageFileStat1.file,
            diff,
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
}: {
  filePatterns: string[],
}) {
  const files = await globby(filePatterns)

  const poolRunner = new PoolRunner(new Pool(6))

  const imageFileStats = await Promise.all(files.map(async (file) => {
    try {
      const imageFileStat = await poolRunner.run<ImageFileStat>(1, async () => {
        const _sharp = sharp(file)
        const metadata = await _sharp.metadata()
        const buffer = await _sharp.raw().toBuffer()
        const image: Image = {
          data    : buffer,
          channels: metadata.channels,
          width   : metadata.width,
          height  : metadata.height,
        }

        const colorStat = calcColorStat(image)

        return {
          file,
          colorStat,
        }
      })

      return imageFileStat
    }
    catch (err) {
      console.error(file + ': ' + err.message)
    }
  }))

  const groups = groupImages({
    imageFileStats,
    maxDiff: 1.35e-7,
  })

  console.log(groups)
}
