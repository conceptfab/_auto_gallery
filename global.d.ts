declare module "*.json" {
  const value: unknown;
  export default value;
}

declare module 'adm-zip' {
  interface ZipEntry {
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer;
  }
  class AdmZip {
    constructor(buffer?: Buffer);
    getEntries(): ZipEntry[];
  }
  export = AdmZip;
}