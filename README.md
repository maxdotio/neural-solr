# Neural Solr

<img src="assets/logo.png" height="128" /> <img src="assets/solr.png" height="128" />

This project provides a complete and working semantic search application, using [Mighty Inference Server](https://max.io), [Apache Solr v9](https://solr.apache.org), and an example Node.js express application.

# How to use it

## Prerequisites

You'll need docker and a recent version of node.js (tested on v16).

_The project has been tested and works well on Linux and Mac Intel. Mac M1 support is in development._

## Installation

Simply clone this repository, then start the servers with `docker compose up` (or `docker compose up -d` to run in detached mode).

You may inspect the `docker-compose.yaml` file to understand how Solr, Zookeeper, Mighty, and the Node app are configured.

_Note: The SolrCloud will take about a minute to start up._

## Index a website from a sitemap!

Scrape and index any website that has a sitemap.xml file available.  Simply run the following:
`./website.sh [name] [https://example.com/sitemap.xml]` (where `[name]` is any name you give and replace the example sitemap with your own.

This will download, infer, and index all the HTML in the sitemap provided, and produce Solr documents of the format

```
{
    "id":docid,
    "url_s":doc.url,
    "title_txt_en":doc.title,
    "author_s":doc.author,
    "description_txt_en":doc.description,
    "published_s":doc.published,
    "modified_s":doc.modified,
    "image_s":doc.image,
    "text_txt_en":text,
    "vector":vector
}
```

Where "vector" is the inferred vector of the concatenated title_txt_en and text_txt_en values.

An example you can try is the Microsoft AI blog sitemap:

```bash
./website.sh microsoft_ai https://blogs.microsoft.com/ai/post-sitemap.xml
```

# Querying

Once you have indexed content, you can query! Following the above example sitemap for the Microsoft AI blog, you can navigate to [http://localhost:8000/solr/microsoft_ai/select?q={!knn%20f=vector%20topK=10}{!mighty%20the%20future%20of%20robotics}](http://localhost:8000/solr/microsoft_ai/select?q={!knn%20f=vector%20topK=10}{!mighty%20the%20future%20of%20robotics}) to try the service.

## How querying works

The service exposes a route /solr/:core/:handler that works just like a regular Solr request handler endpoint - and enriches the query with an inferred vector from text.

The service is elegant in that it adds a query processor as middleware to a regular Solr query.  This lets you call the service from an existing application that already uses Solr, and works with tools like Splainer.io and Quepid.com.

To perform an approximate nearest neighbor search in Solr 9, you use the knn query processor outlined here:
https://solr.apache.org/guide/solr/latest/query-guide/dense-vector-search.html 

For example:
```
q={!knn f=vector topK=10}[1.0, 0.3, 2.1, ...]
```

To query using this service you replace the example vector with a new processor `{!mighty ...}` and put the search terms in place of the ellipsis.  For example:  `q={!knn f=vector topK=10}{!mighty the future of robotics}` will infer 'the future of robotics' to get a vector, query Solr, and return the results.

It is recommended to look at app/app.mjs and understand how the query processor is implemented, so you can enhance it and adapt it to your own needs.

## Splainer

Use it with Splainer!

<img src="assets/solr.png" height="128" />

http://splainer.io/#?solr=http:%2F%2Flocalhost:8000%2Fsolr%2Fmicrosoft_ai%2Fselect%3Fq%3D%7B!knn%20f%3Dvector%20topK%3D10%7D%7B!mighty%20future%20of%20robotics%7D%26fl%3Dtitle_txt_en%20text_txt_en%20url_s%20author_s&fieldSpec=title:title_txt_en,text_txt_en,url_s,author_s

# What's inside?

- Solr is used as the search engine
- Zookeeper is used for Solr Cloud mode
- Mighty Inference Server is used for inference with the sentence-transformers model https://huggingface.co/sentence-transformers/multi-qa-MiniLM-L6-cos-v1
- Node.js and Express form the basic Search UI and API
- mighty-batch is used for text processing and ETL
- some simple scripts (index.sh, website.sh, tools/load.js) to orchestrate scraping and loading

