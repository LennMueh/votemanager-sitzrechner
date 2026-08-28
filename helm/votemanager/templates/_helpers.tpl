{{- define "votemanager.name" -}}votemanager{{- end }}
{{- define "votemanager.labels" -}}
app.kubernetes.io/name: {{ include "votemanager.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
{{- define "votemanager.databaseUrl" -}}
postgres://{{ .Values.database.user }}:{{ required "database.password is required when database.bundled=true" .Values.database.password }}@{{ .Release.Name }}-postgres:5432/{{ .Values.database.name }}
{{- end }}
{{- define "votemanager.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
seccompProfile: { type: RuntimeDefault }
{{- end }}
{{- define "votemanager.securityContext" -}}
allowPrivilegeEscalation: false
capabilities: { drop: ["ALL"] }
readOnlyRootFilesystem: true
{{- end }}
{{- /* Deployed wird per Digest; tag bleibt Rückfallebene für lokale Bauten. */ -}}
{{- define "votemanager.image" -}}
{{- if .Values.image.digest -}}
{{ .Values.image.repository }}@{{ .Values.image.digest }}
{{- else -}}
{{ .Values.image.repository }}:{{ .Values.image.tag }}
{{- end -}}
{{- end }}
