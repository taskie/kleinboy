import fs from "fs";
import glob from "glob";
import toml from "toml";
import yaml from "js-yaml";
import path from "path";
import { promisify } from "util";

import unified from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkFrontmatter from "remark-frontmatter";
import rehypeStringify from "rehype-stringify";
import { Node } from "unist";

type Config = {
  untitled?: string;
  dumpArticleMetadata?: boolean;
  dumpArticleAST?: boolean;
  dumpArticleHTML?: boolean;
  dumpTagMetadata?: boolean;
};

// https://jekyllrb.com/docs/front-matter/

type FrontMatter = {
  layout?: string;
  published?: boolean;
  date?: string;
  category?: string;
  categories?: string[];
  tags?: string[];

  "x-kleinboy"?: KleinboyFrontMatter;
  [k: string]: any;
};

type KleinboyFrontMatter = {
  status?: string;
  title?: string;
  description?: string;
  images?: [];
  published_time?: string;
  modified_time?: string;
};

// https://ogp.me

type ArticleMetadata = {
  path: string;
  sourceType?: string;
  sourcePath?: string;
  title: string;
  description?: string;
  tags?: string[];
  images?: string[];
  status?: string;
  published_time?: string;
  modified_time?: string;
};

type ArticleIndex = {
  path: string;
  status?: string;
  published_time?: string;
};

function makeArticleIndex({ path, status, published_time }: ArticleMetadata): ArticleIndex {
  return { path, status, published_time };
}

function findTexts(node: Node, visitor?: (node: Node) => boolean): string[] {
  let result: string[] = [];
  if (visitor != null) {
    if (!visitor(node)) {
      return result;
    }
  }
  if (["text", "inlineCode"].includes(node.type) && typeof node.value === "string") {
    result.push(node.value);
  } else {
    if ("children" in node && typeof node.children === "object") {
      const children = (node.children as unknown) as Node[];
      for (const child of children) {
        result = result.concat(findTexts(child, visitor));
      }
    } else if (["code", "image"].includes(node.type)) {
      result.push("...");
    } else {
      // ignore (html)
    }
  }
  return result;
}

function extractFrontmatter(node: Node): FrontMatter | undefined {
  if (["yaml", "toml"].includes(node.type)) {
    if (node.type === "toml") {
      return toml.parse(node.value as string) as FrontMatter;
    } else {
      return yaml.safeLoad(node.value as string) as FrontMatter;
    }
  } else if ("children" in node && typeof node.children === "object") {
    const children = (node.children as unknown) as Node[];
    for (const child of children) {
      const frontmatter = extractFrontmatter(child);
      if (frontmatter != null) {
        return frontmatter;
      }
    }
  } else {
    // nop
  }
  return undefined;
}

function extractTitle(node: Node): string | undefined {
  if (node.type === "heading") {
    return findTexts(node).join(" ");
  } else if ("children" in node && typeof node.children === "object") {
    const children = (node.children as unknown) as Node[];
    for (const child of children) {
      const title = extractTitle(child);
      if (title != null) {
        return title;
      }
    }
  } else {
    // nop
  }
  return undefined;
}

function extractDescription(node: Node, options?: { maxLength?: number; ellipsis?: string }): string {
  const maxLength = options?.maxLength ?? 200;
  const ellipsis = options?.ellipsis ?? "...";
  const texts = findTexts(node, (node) => {
    if (node.type === "heading") {
      return false;
    }
    return true;
  });
  const source = texts
    .join(" ")
    .replace(/(^\s|\s$)/, "")
    .replace(/\s+/, " ");
  if (source.length <= maxLength) {
    return source;
  } else {
    return source.slice(0, maxLength - ellipsis.length) + ellipsis;
  }
}

function extractImages(node: Node): string[] {
  let images: string[] = [];
  if (node.type === "image") {
    images.push(node.url as string);
  } else if ("children" in node && typeof node.children === "object") {
    const children = (node.children as unknown) as Node[];
    for (const child of children) {
      images = images.concat(extractImages(child));
    }
  }
  return images;
}

async function findMetadataFrontmatter(markdownPath: string): Promise<FrontMatter | undefined> {
  for (const metadataExt of [".json", ".yml", ".yaml", ".toml"]) {
    const metadataPath = markdownPath.replace(/\.md$/, ".blog" + metadataExt);
    if (await promisify(fs.exists)(metadataPath)) {
      const metadataString = await promisify(fs.readFile)(metadataPath, "utf-8");
      if (metadataExt === ".json") {
        return JSON.parse(metadataString) as FrontMatter;
      } else if (metadataExt === ".toml") {
        return toml.parse(metadataString) as FrontMatter;
      } else {
        return yaml.safeLoad(metadataString) as FrontMatter;
      }
    }
  }
  return undefined;
}

type ArticleRegistry = {
  articles: { [k: string]: ArticleMetadata };
  orderedArticles: ArticleIndex[];
};

function makeProcessor(_config: Config): unified.Processor<unified.Settings> {
  return unified().use(remarkParse).use(remarkFrontmatter, ["yaml", "toml"]).use(remarkRehype).use(rehypeStringify);
}

async function collectArticle(
  markdownPath: string,
  articlePath: string,
  processor: unified.Processor<unified.Settings>,
  config: Config,
): Promise<ArticleMetadata> {
  const untitled = config.untitled ?? "(Untitled)";
  const markdownString = await promisify(fs.readFile)(markdownPath, "utf-8");
  const markdownAST = processor.parse(markdownString);
  const markdownFrontmatter = extractFrontmatter(markdownAST);
  const metadataFrontmatter = await findMetadataFrontmatter(markdownPath);
  const frontmatter = ((): FrontMatter => {
    if (metadataFrontmatter != null || markdownFrontmatter != null) {
      return {
        ...markdownFrontmatter,
        ...metadataFrontmatter,
      };
    }
    return metadataFrontmatter ?? markdownFrontmatter ?? {};
  })();
  const title = frontmatter["x-kleinboy"]?.title ?? extractTitle(markdownAST) ?? untitled;
  const description = frontmatter["x-kleinboy"]?.description ?? extractDescription(markdownAST);
  const images = frontmatter["x-kleinboy"]?.images ?? extractImages(markdownAST);
  const status = frontmatter["x-kleinboy"]?.status;
  const articleMetadata = {
    path: articlePath,
    sourceType: "markdown",
    sourcePath: markdownPath,
    title,
    description,
    tags: frontmatter.tags,
    images,
    status,
    published_time: frontmatter["x-kleinboy"]?.published_time ?? frontmatter.date,
    modified_time: frontmatter["x-kleinboy"]?.modified_time ?? frontmatter.date,
  } as ArticleMetadata;
  if (config.dumpArticleAST) {
    const astPath = path.join("generated", "ast", articleMetadata.path + ".json");
    await promisify(fs.mkdir)(path.dirname(astPath), { recursive: true });
    promisify(fs.writeFile)(astPath, JSON.stringify(markdownAST), "utf-8");
  }
  if (config.dumpArticleHTML) {
    const htmlPath = path.join("generated", "html", articleMetadata.path + ".html");
    await promisify(fs.mkdir)(path.dirname(htmlPath), { recursive: true });
    const runNode = await processor.run(markdownAST);
    promisify(fs.writeFile)(htmlPath, processor.stringify(runNode), "utf-8");
  }
  return articleMetadata;
}

async function collectArticles(config: Config): Promise<ArticleRegistry> {
  const result: { [k: string]: ArticleMetadata } = {};
  const processor = makeProcessor(config);
  const articlesDir = "articles";
  if (!(await promisify(fs.exists)(articlesDir))) {
    throw new Error("articles doesn't exist");
  }
  for (const markdownPath of await promisify(glob)(path.join(articlesDir, "**", "*.md"), {})) {
    let articlePath = markdownPath.replace(/\.md$/, "");
    if (articlePath.startsWith(articlesDir + path.sep)) {
      articlePath = articlePath.slice((articlesDir + path.sep).length);
    }
    const articleMetadata = await collectArticle(markdownPath, articlePath, processor, config);
    result[articleMetadata.path] = articleMetadata;
  }
  const orderedArticles: ArticleIndex[] = [];
  for (const article of Object.values(result)) {
    orderedArticles.push(makeArticleIndex(article));
  }
  orderedArticles.sort((a, b) => {
    if (a.published_time == null && b.published_time == null) {
      return -a.path.localeCompare(b.path);
    } else if (a.published_time == null) {
      return -1;
    } else if (b.published_time == null) {
      return 1;
    } else {
      return -(Date.parse(a.published_time) - Date.parse(b.published_time));
    }
  });
  return { articles: result, orderedArticles };
}

function getOrPrepare<T>(m: { [k: string]: T }, k: string, ifNone: (k?: string) => T): T {
  let v = m[k];
  if (v == null) {
    v = ifNone(k);
    m[k] = v;
  }
  return v;
}

function register<T>(m: { [k: string]: { [k: string]: T } }, k1: string, k2: string, value: T) {
  getOrPrepare(m, k1, () => ({} as { [k: string]: T }))[k2] = value;
}

type TagMetadata = {
  key: string;
  title: string;
  article?: ArticleMetadata;
};

type TagRegistry = {
  tags: { [k: string]: TagMetadata };
  tagToArticles: { [k: string]: { [k: string]: ArticleIndex } };
};

export async function collectTags({ articles }: ArticleRegistry, config: Config): Promise<TagRegistry> {
  const processor = makeProcessor(config);
  const tagToArticleIndicesMap: { [k: string]: { [k: string]: ArticleIndex } } = {};
  for (const article of Object.values(articles)) {
    if (article.tags == null) {
      continue;
    }
    for (const tag of article.tags) {
      register(tagToArticleIndicesMap, tag, article.path, makeArticleIndex(article));
    }
  }
  const tagsDir = "tags";
  const tags: { [k: string]: TagMetadata } = {};
  for (const key of Object.keys(tagToArticleIndicesMap)) {
    const markdownPath = path.join(tagsDir, key + ".md");
    if (await promisify(fs.exists)(markdownPath)) {
      const articlePath = path.join(tagsDir, key);
      const article = await collectArticle(markdownPath, articlePath, processor, config);
      tags[key] = {
        key,
        title: article.title ?? key,
        article,
      };
    } else {
      tags[key] = {
        key,
        title: key,
      };
    }
  }
  return { tags, tagToArticles: tagToArticleIndicesMap };
}

export async function execute(config: Config): Promise<void> {
  const articles = await collectArticles(config);
  const tags = await collectTags(articles, config);
  if (config.dumpArticleMetadata) {
    await promisify(fs.mkdir)(path.join("generated"), { recursive: true });
    await promisify(fs.writeFile)(path.join("generated", "articles.json"), JSON.stringify(articles), "utf-8");
  }
  if (config.dumpTagMetadata) {
    await promisify(fs.mkdir)(path.join("generated"), { recursive: true });
    await promisify(fs.writeFile)(path.join("generated", "tags.json"), JSON.stringify(tags), "utf-8");
  }
}
