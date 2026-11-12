import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { isNativeApp } from './native';
import { downloadBlob } from './storage';

/** Carga pdfmake bajo demanda (≈1 MB) y entrega el PDF (descarga en web, compartir en la APK). */
export async function downloadPdf(doc: TDocumentDefinitions, fileName: string): Promise<void> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  pdfMake.addVirtualFileSystem(vfs);
  const pdf = pdfMake.createPdf(doc);
  if (isNativeApp()) await downloadBlob(await pdf.getBlob(), fileName);
  else await pdf.download(fileName);
}
