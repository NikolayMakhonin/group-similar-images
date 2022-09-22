export type Image = {
  data: Uint8Array,
  width: number
  height: number
  channels: number
}

export type ImageFile = {
  file: string,
  hash: string,
}

export type ImageFileGroupItem = {
  file: string,
  diff: number,
}
