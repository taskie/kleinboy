export type Config = {
  untitled?: string;
  dumpArticleMetadata?: boolean;
  dumpArticleAST?: boolean;
  dumpArticleHTML?: boolean;
  dumpTagMetadata?: boolean;
};

// https://jekyllrb.com/docs/front-matter/

export type FrontMatter = {
  layout?: string;
  published?: boolean;
  date?: string;
  category?: string;
  categories?: string[];
  tags?: string[];

  "x-kleinboy"?: KleinboyFrontMatter;
  [k: string]: any;
};

export type KleinboyFrontMatter = {
  status?: string;
  title?: string;
  description?: string;
  images?: [];
  published_time?: string;
  modified_time?: string;
};

// https://ogp.me

export type ArticleMetadata = {
  path: string;
  source_type?: string;
  source_path?: string;
  title: string;
  description?: string;
  tags?: string[];
  images?: string[];
  status?: string;
  published_time?: string;
  modified_time?: string;
};

export type ArticleIndex = {
  path: string;
  status?: string;
  published_time?: string;
};
