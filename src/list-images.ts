import fs from "fs";
import path from "path";
import { promisify } from "util";

import { Config, ArticleMetadata } from "./types";

export async function execute(config: Config): Promise<void> {
  const articlesJson = await promisify(fs.readFile)(path.join("generated", "articles.json"), "utf-8");
  const articles = JSON.parse(articlesJson) as { articles: { [k: string]: ArticleMetadata } };
  for (const article of Object.values(articles.articles)) {
    if (article.images != null) {
      for (const image of article.images) {
        console.log(path.join(path.dirname(article.path), image));
      }
    }
  }
}
