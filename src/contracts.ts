export type Image = {
  data: Uint8Array,
  width: number
  height: number
  channels: number
}

export type Color = [R: number, G: number, B: number] | Uint8Array

export type ColorStat = {
  color: Color,
  value: number,
}

export type ImageFileStat = {
  file: string,
  colorStats: ColorStat[],
  image?: Image,
}

export type ImageFileGroupItem = {
  file: string,
  similarity: number,
  image: Image,
}
