if [ -z "$1" ]
then
    echo "Specify the website name! Like this:"
    echo "./website.sh example https://example.com/sitemap.xml"
    exit
fi

if [ -z "$2" ]
then
    echo "Specify the sitemap! Like this:"
    echo "./website.sh example https://example.com/sitemap.xml"
    exit
fi

s=$(which mighty-batch)
if [ "$s" = "" ];
then
    npm install -g mighty-batch
    cd tools
    npm install
    cd ..    
fi

mighty-batch --threads 1 --workers 2 --sitemap $2 --property text
node tools/load.js --sitemap $2 --name $1
