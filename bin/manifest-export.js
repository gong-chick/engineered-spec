const fs = require('fs');
const path = require('path');

const sync = require('./sync');

async function main(argv) {
  try {
    const options = sync.parseArgs(argv);
    if (options.help) {
      console.log('usage: ai-spec-auto manifest-export [target] --manifest <manifest.json|url> [--out <file>] [--json]');
      return 0;
    }

    const prepared = await sync.prepareSync(options);
    const output = `${JSON.stringify(prepared.manifest, null, 2)}\n`;

    if (options.out) {
      fs.mkdirSync(path.dirname(options.out), { recursive: true });
      fs.writeFileSync(options.out, output, 'utf8');
    }

    process.stdout.write(output);
    return 0;
  } catch (error) {
    console.error(`manifest-export（清单导出） failed: ${error.message}`);
    return 1;
  }
}

module.exports = { main };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
