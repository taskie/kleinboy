import { execute } from "./kleinboy";

type ParsedArgs = {
  dumpArticleMetadata: boolean;
  dumpArticleAST: boolean;
  dumpArticleHTML: boolean;
  dumpTagMetadata: boolean;
  help: boolean;
  errors: Failure[];
};

type Failure = {
  code: string;
  message: string;
  userInfo: any;
};

function usage(printer: (s: string) => void = console.log) {
  const usage = `kleinboy - CMS on the file system`;
  printer(usage);
}

function parseArgs(args: string[]): ParsedArgs {
  const result = {
    dumpArticleMetadata: true,
    dumpArticleAST: false,
    dumpArticleHTML: false,
    dumpTagMetadata: true,
    help: false,
    errors: [],
  };
  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "-d":
      case "--debug":
        result.dumpArticleAST = true;
        result.dumpArticleHTML = true;
        break;
      case "-h":
      case "--help":
        result.help = true;
        break;
      default:
        break;
    }
    ++i;
  }
  return result;
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.errors.length !== 0) {
    const { errors } = opts;
    for (const error of errors) {
      console.log(error.message);
    }
    process.exit(1);
  }
  if (opts.help) {
    usage();
    process.exit(0);
  }
  new Promise(() => {
    return execute({
      dumpArticleMetadata: opts.dumpArticleMetadata,
      dumpArticleAST: opts.dumpArticleAST,
      dumpArticleHTML: opts.dumpArticleHTML,
      dumpTagMetadata: opts.dumpTagMetadata,
    });
  })
    .then(() => {
      // completed
    })
    .catch((err) => {
      console.error(err);
    });
}

main();
