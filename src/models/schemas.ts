import { z } from 'zod';

export const SiteSchema = z.enum(['Lisboa', 'Porto', 'Bragança', 'Covilhã', 'Brasil']);

export const CertificacaoSchema = z.object({
  equipa: z.string().min(1).max(30),
  email: z.string().email().max(200),
  codigo_certificacao: z.string().min(1).max(10),
  nome_certificacao: z.string().min(1).max(100),
  site: SiteSchema,
  externo: z.boolean(),
  data_certificacao: z.string().date(),
  data_expiracao: z.string().date(),
  expirado: z.boolean(),
  saiu: z.boolean(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Certificacao = z.infer<typeof CertificacaoSchema>;

export const CertificacaoCreateSchema = CertificacaoSchema.omit({
  created_at: true,
  updated_at: true,
});

export const CertificacaoUpdateSchema = CertificacaoCreateSchema.partial();
