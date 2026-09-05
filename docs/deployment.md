# Lokales Kubernetes-Deployment

Voraussetzungen sind Docker, Kubernetes und Helm 3. Das Image enthält Web, Migrationen und Poller; Helm startet zwei Web-Pods, einen Poller und standardmäßig PostgreSQL mit 10-GiB-PVC.

## Lokaler Compose-Probelauf

Der begrenzte Probe-Crawl lädt nur die Regionen Lüneburg (`03355`, Wahltag `20210912`) und Aachen (`05334`, Wahltag `20250914`). Ein Kontakt im User-Agent ist Pflicht:

```sh
export CRAWLER_CONTACT='mailto:betrieb@example.org'
docker compose --profile probe run --rm probe
docker compose up -d web
```

Die Probe wiederholt anschließend alle gefilterten Pfade und akzeptiert den Lauf nur, wenn beide Regionen und Wahltage gefunden wurden und HTTP 304 oder die SHA-256-Deduplizierung unveränderte Inhalte abfängt.

Web läuft danach auf <http://localhost:3000>. Für den dauerhaften Poller statt des Probe-Crawls gilt `docker compose --profile live up -d`; dessen Metriken liegen auf <http://localhost:9090/metrics>. `docker compose down` behält die Daten, `docker compose down --volumes` entfernt auch die lokale PostgreSQL-Datenbank.

## Kubernetes

```sh
docker build -t votemanager-sitzrechner:local .
helm upgrade --install votemanager helm/votemanager \
  --set image.tag=local \
  --set database.password='lokales-langes-passwort' \
  --set-string crawler.contact='mailto:betrieb@example.org'
kubectl port-forward service/votemanager-web 3000:80
```

`crawler.contact` und bei gebündeltem PostgreSQL `database.password` sind Pflichtwerte. Der Backfill bleibt standardmäßig aus und wird mit `--set crawler.backfill=true` aktiviert.

Für eine externe Datenbank wird ein Secret mit vollständiger URL angelegt und PostgreSQL abgeschaltet:

```sh
kubectl create secret generic votemanager-external-db \
  --from-literal=database-url='postgres://user:pass@host:5432/votemanager'
helm upgrade --install votemanager helm/votemanager \
  --set image.tag=local \
  --set database.bundled=false \
  --set database.existingSecret=votemanager-external-db \
  --set-string crawler.contact='mailto:betrieb@example.org'
```

## Impressum und Datenschutzerklärung

`/impressum` und `/datenschutz` rendern Markdown, das die Anwendung zur Laufzeit aus dem Verzeichnis `RECHTSTEXTE_PFAD` liest (Dateien `impressum.md` und `datenschutz.md`, Vorgabe `rechtstexte`). Fehlt eine Datei, zeigt die Seite einen sichtbaren Hinweis, dass der Text nicht hinterlegt ist — sie bleibt bewusst nicht still leer.

Die Texte liegen **nicht in diesem Repo**: sie enthalten die ladungsfähige Anschrift nach § 5 DDG, und dieses Repo ist öffentlich. Im Cluster kommen sie aus einer ConfigMap, die das Chart **nicht erzeugt**, sondern nur einhängt:

```sh
kubectl create configmap votemanager-rechtstexte \
  --from-file=impressum.md --from-file=datenschutz.md
helm upgrade --install votemanager helm/votemanager \
  --set rechtstexte.enabled=true \
  --set rechtstexte.configMap=votemanager-rechtstexte
```

Der ConfigMap-Name muss stabil sein, also ohne Inhalts-Hash. Nur dann bleibt das Deployment bei einer Textänderung unverändert, das Kubelet tauscht den Inhalt im laufenden Pod aus, und die nächste Anfrage liest ihn — kein Rollout, kein Image-Bau. Aus demselben Grund trägt das Pod-Template bewusst **keine** `checksum/config`-Annotation.

Für die Entwicklung zeigt man den Pfad auf die Arbeitskopie, in der die Texte gepflegt werden:

```sh
RECHTSTEXTE_PFAD=../optiplex01_infra/rechtstexte npm run dev
```

Ingress ist optional und controller-neutral (`ingress.enabled`, `ingress.className`, `ingress.host`, `ingress.tls`). Für Produktion sollten externes PostgreSQL oder mindestens 50 GiB Speicher, ein unveränderliches Image-Tag und ein vorhandener Ingress-Controller verwendet werden. Web-Metriken liegen unter `/metrics`, Poller-Metriken auf Port 9090.

Mit einem bereits clusterweit installierten Caddy-Ingress-Controller genügt zum Beispiel
`--set ingress.enabled=true --set ingress.className=caddy --set ingress.host=wahlen.local`.
Der Chart installiert bewusst keinen clusterweiten Controller.
