FROM solr:9

USER root

ADD run_solr.sh ./run_solr.sh
RUN chown solr:solr run_solr.sh
RUN chmod u+x run_solr.sh

USER solr

ENTRYPOINT "./run_solr.sh" 