# DHA submission — folder guide

**1_CLIENT_READY** — the only files to attach for the client (nothing else leaves the company):
- DoctorNow_Architecture_Specification_v1.1 (.docx editable, .pdf to send)
- DoctorNow_Compliance_Matrix_v1.0 (.docx editable, .pdf to send)
- DoctorNow_Architecture_Dossier.pdf (26 diagram views)
- DoctorNow_Architecture_Dossier.drawio (editable diagrams)
- DoctorNow_Diagrams_PNG_SVG.zip (diagram images)

**2_INTERNAL** — for our own use (do not send, do not commit to a public repo):
- Cover_Email_Draft.md — email text to accompany the client files
- INTERNAL_Gaps_Tracker_and_Code_Traceability.md — what is missing, how to build it, decisions needed, and which code backs each claim
- generators_source.zip — scripts that regenerate the diagrams (Python/Graphviz) and the Word documents (Node docx). Unzip, run `python3 src/build.py overall modules` for diagrams; `node spec.js` / `node matrix.js` for documents.

Rule: when code changes, update the matrix statuses and the tracker, regenerate, and bump version/date before sending anything.
