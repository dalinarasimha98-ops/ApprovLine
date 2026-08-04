import { reembedPlaybookChunks } from '@/services/playbooks';

const organizationId = process.argv[2];

const result = await reembedPlaybookChunks(organizationId);
console.log(JSON.stringify(result, null, 2));

if (result.failed > 0) {
  process.exitCode = 1;
}
