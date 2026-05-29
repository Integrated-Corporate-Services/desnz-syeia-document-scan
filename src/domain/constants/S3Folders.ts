export const S3_FOLDERS = {
  CLEAN: 'clean',
  INFECTED: 'infected',
} as const;

export type S3Folder = typeof S3_FOLDERS[keyof typeof S3_FOLDERS];
