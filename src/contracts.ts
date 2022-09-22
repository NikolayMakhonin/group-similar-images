export type Image = {
  data: Uint8Array,
  width: number
  height: number
  channels: number
}

export type ImageFileStat = {
  file: string,
  colorStat: Float32Array,
}

export type ImageFileGroupItem = {
  file: string,
  diff: number,
}
