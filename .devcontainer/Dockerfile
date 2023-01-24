FROM joamatab/gdsfactory:latest

EXPOSE 8082
EXPOSE 8083
EXPOSE 8888

USER root
USER jovyan
RUN conda init bash
RUN pip install kweb
WORKDIR /home/jovyan
