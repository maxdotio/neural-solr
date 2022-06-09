import fs from "fs";
import path from "path";
import express from "express";
import fetch from "node-fetch";
import { MightyPool } from "node-mighty";

///
/// Mighty  Connections
///
//const mighty = new MightyPool(["http://mighty_1:5050","http://mighty_2:5051"],"sentence-transformers");
const mighty = new MightyPool(["http://risa:5050","http://risa:5051"],"sentence-transformers");

//Query parser RegEx
const re_mighty = /\{\!mighty([^\}]+)\}/g;

///
/// Express routes
///
let app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/solr/:site/:handler", async function (req, res) {

    let q = req.query?req.url.substr(req.url.indexOf('?')+1):'';
    let queries = q.match(re_mighty).map(s=>{
        s=decodeURI(s);
        return s.substring(9,s.length-1);
    });

    if(!queries) {
        res.status(400).send({"message":"Empty search query!"});
    } else {
        let search = queries[0];
        let mighty_res = await mighty.get(search);
        if (mighty_res.err) {
            res.status(500).send(mighty_res.err);
        } else {
            let url = `http://risa:8983/solr/${req.params.site}/${req.params.handler}`
            let vector = mighty_res.response.outputs[0];
            let vq = JSON.stringify(vector);
            let body = q.replace(re_mighty,vq);
            fetch(url,{
                method: 'POST', 
                body: body, 
                headers: {"Content-Type":"application/x-www-form-urlencoded"}
            })
              .then(
                result =>
                  new Promise((resolve, reject) => {
                    result.body.pipe(res);
                    result.body.on("end", () => resolve(search));
                    res.on("error", reject);
                  })
              )
              .then(x => console.log(x));   
        }
    }
});

app.listen(8000,"0.0.0.0");
console.log("Application listening on http://localhost:8000");
