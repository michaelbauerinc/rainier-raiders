{{- define "website.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "website.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "website.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "website.selectorLabels" -}}
app.kubernetes.io/name: {{ include "website.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "website.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | quote }}
{{ include "website.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: rainier-raiders
{{- end -}}

{{- define "website.image" -}}
{{- $repository := required "image.repository is required" .Values.image.repository -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" $repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" $repository (required "set image.digest or image.tag" .Values.image.tag) -}}
{{- end -}}
{{- end -}}
