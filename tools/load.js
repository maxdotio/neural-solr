//
// Formats and loads vector files into Qdrant as points
//

import fs from "fs";
import fetch from "node-fetch";
import progress from "progress";
import { v4 as uuidv4} from "uuid";
import { program } from "commander";
import { createClient } from "solr-client";

program
  .option('-f, --files <string>')
  .option('-s, --sitemap <string>')
  .option('-n, --name <string>')
  .option('-h, --host <string>')
  .parse();

const options = program.opts();

function clean_filename(filename) {
    return filename.replace(/[:\/]+/g,'_')
}

let vector_files = null;

if (!options.files) {
    if (!options.sitemap) {
        console.error("You must specify the path to the vector files OR a sitemap.xml url!")
        program.help();
        process.exit(1);
    } else {
        vector_files = `vectors/${clean_filename(options.sitemap)}/`;
    }
} else {
    vector_files = options.files;
}

if (!options.name) {
    console.error("You must specify the site name!")
    program.help();
    process.exit(1);
}

//Globals
const host = options.host||"localhost";
const site = options.name; //"outdoors";
const ignore_fields = ["vectors","texts","entailed","paragraphs","context","body"];
const batch_size = 10;
const collections_api = `http://${host}:8983/solr/admin/collections`;
const schema_api = `http://${host}:8983/api/collections/${site}/schema`;


async function request(url,body,method){
    method = method || "GET";
    let response;
    if (method === "POST") {
        try {
            response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
        } catch(ex) {
            const output = null;
            return [ex,output];
        }
    } else {
        if (body) url += "?" + new URLSearchParams(body).toString();
        try {
            response = await fetch(url);
        } catch(ex) {
            const output = null;
            return [ex,output];
        }
    }

    try {
        const output = await response.json();
        return [null,output];
    } catch(ex) {
        const output = null;
        return [ex,output];
    }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function be_patient(site) {

    //Check if collection exists
    let exists_result = await request(collections_api,{"action":"LIST","name":site});
    while (exists_result[0]) {
        await sleep(1000);
        //console.error("Could not connect to Solr.  The server might not be started yet.  Retrying...");
        exists_result = await request(collections_api,{"action":"LIST","name":site});
    }
    let exists = (
        exists_result[1]&&
        exists_result[1].collections&&
        exists_result[1].collections.indexOf(site)>=0
    )?true:false;

    return exists;

}

//Make a new collection
async function create_collection(DELETE) {

    let exists = await be_patient(site); 

    //Delete it if forced
    if (DELETE && exists) {
        let delete_result = await request(collections_api,{"action":"DELETE","name":site});
        console.log(`Deleted collection ${site}`);
        exists = false;
    }
    
    //Create the collection and vector fieldtype and field
    if (!exists) {
        console.log(`Creating collection ${site}`);
        let create_result = await request(collections_api,{"action":"CREATE","name":site,"numShards":1,"replicationFactor":1});
        if (!create_result[0]) {

            

            let vector_field_type = {
              "add-field-type":{
                "name":"hnsw",
                "class":"solr.DenseVectorField",
                "similarityFunction":"cosine",
                "vectorDimension":384,
                "codecFormat":"Lucene90HnswVectorsFormat",
                "hnswMaxConnections":16,
                "hnswBeamWidth":512
              }
            }

            let vector_field = {
              "add-field":{
                "name":"vector",
                "type":"hnsw",
                "stored":true,
                "indexed":true
              }
            }

            let field_type_result = await request(schema_api,vector_field_type,'POST');
            if (field_type_result[0]) {
                console.error("Could not create field type!");
                console.error(field_type_result[0]);
                process.exit(1);
            }

            let field_result = await request(schema_api,vector_field,'POST');
            if (field_result[0]) {
                console.error("Could not create field!");
                console.error(field_result[0]);
                process.exit(1);
            }

        } else {
            console.error("Could not create collection!");
            console.error(create_result[0]);
            process.exit(1);
        }


    }

    while(!(await be_patient(site))) await sleep(1000);
    console.log(`Collection ${site} Created`);
    let client = createClient({host:host, port:8983, core:site});
    client.autoCommit = true;
    return client;

}


function get_files(path) {
    let files = [];
    let filenames = fs.readdirSync(path);
    for(var j=0;j<filenames.length;j++) {
        if(filenames[j].indexOf(".json")>0) {
            files.push({
                "filename":path + filenames[j],
            });
        }
    }
    return files;
}

function get_documents(files,ignore) {
    let payloads = [];
    let documents = [];

    let id = 0;
    for (var i=0;i<files.length;i++) {
        let doc = JSON.parse(fs.readFileSync(files[i].filename,"utf-8"));
        if (doc && doc && doc.vectors && doc.vectors.length) {

            //For each vector and text pair, create a Qdrant point that we will eventually send to the search engine
            for(var j=0;j<doc.vectors.length;j++) {
                let vec = doc.vectors[j];
                let txt = doc.texts[j];
                if (vec.length) {
                    //Each document body might have been split up if it was long.
                    //We'll create a separate point for each part of the vectorized content.
                    for(var v=0;v<vec.length;v++) {
                        let precision = 1000000;
                        let vector = vec[v].map(f32=>Math.floor(f32*precision)/precision);
                        let text = txt[v];
                        let docid = doc.docid + "_" + v;
                        
                        documents.push({
                            "id":docid,
                            "url_s":doc.url,
                            "title_txt_en":doc.title,
                            "author_s":doc.author,
                            "description_txt_en":doc.description,
                            "published_s":doc.published,
                            "modified_s":doc.modified,
                            "image_s":doc.image,
                            "vector":vector,
                            "text_txt_en":text
                        });
                        
                    }
                }
                
            }
        }
    }

    return documents;
}

//Create the collection!
let client = await create_collection(false);

//Get and transform the files into Solr docs.
let files = get_files(vector_files);
let documents = get_documents(files,ignore_fields);

//Add documents to Solr in batches of 10
let bar = new progress("Indexing [:bar] :percent remaining::etas elapsed::elapsed (:current/:total)", {complete: "=", incomplete: " ", width: 50, total: parseInt(documents.length/batch_size)+1});
for(var p=0;p<documents.length;p+=batch_size) {
    // Add the batch to Solr
    let batch = documents.slice(p,p+batch_size);
    const obj = await client.add(batch);
    bar.tick();
}

let commit = await request(`http://${host}:8983/solr/${site}/update?commit=true`);