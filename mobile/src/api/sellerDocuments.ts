import { api } from './client';

export type DocumentType =
  | 'curp'
  | 'constancia_fiscal'
  | 'opinion_cumplimiento'
  | 'comprobante_domicilio'
  | 'identificacion'
  | 'cuenta_bancaria';

export type DocumentStatus = 'pending' | 'approved' | 'rejected';

export interface SellerDocument {
  id: string;
  documentType: DocumentType;
  fileUrl: string;
  emissionDate: string | null;
  status: DocumentStatus;
  rejectionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export const sellerDocumentsApi = {
  getMyDocuments: () => api.get<SellerDocument[]>('/seller-documents/me'),

  upload: (formData: FormData) =>
    api.post<SellerDocument>('/seller-documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};
