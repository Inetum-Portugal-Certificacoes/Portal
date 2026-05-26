import { certificacoesService } from './services/certificacoes.service';

async function main() {
  const result = await certificacoesService.list({ page: 1, pageSize: 20 });
  console.log(`Tabela stay_certified pronta. Registos atuais: ${result.pagination.total}`);
}

main().catch((error) => {
  console.error('Erro:', error);
  process.exit(1);
});
