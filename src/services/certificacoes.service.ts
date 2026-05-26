import { supabase } from '../db/client';
import {
  Certificacao,
  CertificacaoCreateSchema,
  CertificacaoUpdateSchema,
  SiteSchema,
} from '../models/schemas';

const TABLE = 'stay_certified';

type ListFilters = {
  equipa?: string;
  email?: string;
  codigo_certificacao?: string;
  site?: string;
  externo?: boolean;
  expirado?: boolean;
  saiu?: boolean;
  page?: number;
  pageSize?: number;
};

export class CertificacoesService {
  async create(payload: Omit<Certificacao, 'created_at' | 'updated_at'>) {
    const data = CertificacaoCreateSchema.parse(payload);

    const { data: result, error } = await supabase
      .from(TABLE)
      .insert(data)
      .select('*')
      .single();

    if (error) throw error;
    return result as Certificacao;
  }

  async getByKey(equipa: string, email: string, codigoCertificacao: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('equipa', equipa)
      .eq('email', email)
      .eq('codigo_certificacao', codigoCertificacao)
      .single();

    if (error) throw error;
    return data as Certificacao;
  }

  async list(filters: ListFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from(TABLE)
      .select('*', { count: 'exact' })
      .order('data_expiracao', { ascending: true })
      .order('equipa', { ascending: true })
      .range(from, to);

    if (filters.equipa) query = query.ilike('equipa', `%${filters.equipa}%`);
    if (filters.email) query = query.eq('email', filters.email);
    if (filters.codigo_certificacao) {
      query = query.eq('codigo_certificacao', filters.codigo_certificacao);
    }
    if (filters.site) {
      const site = SiteSchema.parse(filters.site);
      query = query.eq('site', site);
    }
    if (typeof filters.externo === 'boolean') query = query.eq('externo', filters.externo);
    if (typeof filters.expirado === 'boolean') query = query.eq('expirado', filters.expirado);
    if (typeof filters.saiu === 'boolean') query = query.eq('saiu', filters.saiu);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: (data ?? []) as Certificacao[],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
      },
    };
  }

  async update(
    equipa: string,
    email: string,
    codigoCertificacao: string,
    payload: Partial<Omit<Certificacao, 'created_at' | 'updated_at'>>
  ) {
    const data = CertificacaoUpdateSchema.parse(payload);

    const { data: result, error } = await supabase
      .from(TABLE)
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('equipa', equipa)
      .eq('email', email)
      .eq('codigo_certificacao', codigoCertificacao)
      .select('*')
      .single();

    if (error) throw error;
    return result as Certificacao;
  }

  async remove(equipa: string, email: string, codigoCertificacao: string) {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('equipa', equipa)
      .eq('email', email)
      .eq('codigo_certificacao', codigoCertificacao);
    if (error) throw error;
  }

  subscribeToChanges(callback: (row: Certificacao) => void) {
    return supabase
      .channel(`${TABLE}-changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE },
        (payload) => callback((payload.new ?? payload.old) as Certificacao)
      )
      .subscribe();
  }
}

export const certificacoesService = new CertificacoesService();
