FROM joamatab/gdsfactory:latest

EXPOSE 8000

COPY --chown=jovyan . kweb
WORKDIR kweb
RUN make install
WORKDIR src/kweb
ENTRYPOINT ["make", "run"]
