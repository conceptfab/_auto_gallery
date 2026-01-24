export interface ImageFile {
  name: string;
  path: string;
  url: string;
  size?: number;
  lastModified?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

export interface GalleryFolder {
  name: string;
  path: string;
  images: ImageFile[];
  subfolders?: GalleryFolder[];
}

export interface GalleryResponse {
  success: boolean;
  data?: GalleryFolder[];
  error?: string;
}