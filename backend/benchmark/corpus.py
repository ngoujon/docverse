"""Corpus de test du benchmark : une entreprise fictive (« Atelier Lumen »)
et cinq documents couvrant tous les chemins d'ingestion de Docverse :
texte brut (Markdown), Word, PDF texte, PDF scanné (vision/OCR) et image
(vision/OCR). Tout est généré localement et de façon déterministe, pour
que deux runs du benchmark comparent exactement les mêmes entrées.

Les documents scannés gardent leur texte source (`ground_truth`) : on
peut ainsi mesurer objectivement la qualité de la transcription (taux de
similarité caractère par caractère), sans juge IA."""

from pathlib import Path

import fitz  # PyMuPDF
from docx import Document as DocxDocument
from fpdf import FPDF

# --------------------------------------------------------------------------
# 1. Politique RH (Markdown)
# --------------------------------------------------------------------------

POLITIQUE_RH = """# Atelier Lumen - Politique ressources humaines (version 2025)

## 1. Temps de travail

La durée de référence est de 37 heures par semaine pour les salariés non cadres.
Les heures effectuées au-delà de 37 heures donnent droit à des jours de RTT,
à raison de 12 jours de RTT par année civile complète. Les cadres sont au
forfait jours : 214 jours travaillés par an, sans décompte horaire.

Les plages fixes de présence sont de 10h00 à 12h00 et de 14h00 à 16h00. En
dehors de ces plages, chaque salarié organise librement ses horaires, dans la
limite d'une amplitude de 8h00 à 19h30.

## 2. Congés payés

Chaque salarié bénéficie de 27 jours ouvrés de congés payés par an, soit deux
jours de plus que le minimum légal. Les congés sont acquis du 1er juin au 31 mai.
Au moins 10 jours consécutifs doivent être posés entre le 1er mai et le 31 octobre.
Les demandes de congés de plus de 5 jours doivent être déposées au moins 4 semaines
à l'avance dans l'outil SIRH.

Après 5 ans d'ancienneté, le salarié bénéficie d'un jour de congé supplémentaire,
puis d'un deuxième jour après 10 ans d'ancienneté.

## 3. Télétravail

Le télétravail est ouvert à tous les postes compatibles après la fin de la
période d'essai. Le nombre maximal de jours de télétravail est de 3 jours par
semaine pour les salariés non cadres et de 2 jours par semaine pour les
managers d'équipe, afin de garantir leur disponibilité sur site.

Une indemnité forfaitaire de télétravail de 2,50 euros par jour télétravaillé
est versée, plafonnée à 55 euros par mois. Le matériel (ordinateur portable,
écran, casque) est fourni par l'entreprise.

Le mardi est un jour de présence obligatoire pour l'ensemble des équipes.

## 4. Période d'essai

La période d'essai est de 2 mois pour les employés, 3 mois pour les techniciens
et agents de maîtrise, et 4 mois pour les cadres. Elle peut être renouvelée une
fois, avec l'accord écrit du salarié.

## 5. Mutuelle et prévoyance

La mutuelle santé est obligatoire. L'entreprise prend en charge 60 % de la
cotisation pour le salarié seul et 50 % de la cotisation pour l'option famille.
La prévoyance est prise en charge à 100 % par l'employeur.

## 6. Tickets restaurant

Chaque salarié reçoit une carte titre-restaurant d'une valeur faciale de
11 euros par jour travaillé, financée à 60 % par l'employeur. Les jours de
télétravail ouvrent également droit au titre-restaurant.

## 7. Formation

Chaque salarié dispose d'un budget formation individuel de 1 200 euros par an,
en complément du compte personnel de formation. Les demandes sont validées par
le manager puis par la responsable formation, Mme Claire Vasseur.

## 8. Notes de frais

Les notes de frais doivent être déposées avant le 5 du mois suivant la dépense.
Le plafond de remboursement d'une nuit d'hôtel est de 130 euros à Paris et de
95 euros en province. Les trajets en train se font en seconde classe, sauf
trajet de plus de 4 heures.

## 9. Entretiens annuels

L'entretien annuel d'évaluation a lieu chaque année en janvier. L'entretien
professionnel, distinct, a lieu tous les 2 ans. Les augmentations individuelles
sont annoncées en mars et appliquées sur la paie d'avril.

## 10. Contact

Pour toute question, contacter le service RH à l'adresse rh@atelier-lumen.example.
"""

# --------------------------------------------------------------------------
# 2. Contrat de prestation (Word)
# --------------------------------------------------------------------------

CONTRAT_PARAGRAPHES = [
    "CONTRAT DE PRESTATION DE SERVICES N° CP-2025-018",
    "Entre la société Atelier Lumen SAS, au capital de 150 000 euros, dont le siège "
    "est situé 42 quai Perrache, 69002 Lyon, ci-après « le Client », et la société "
    "Nordique Conseil SARL, dont le siège est situé 8 rue de la Liberté, 59000 Lille, "
    "ci-après « le Prestataire ».",
    "Article 1 - Objet. Le présent contrat a pour objet la refonte complète du système "
    "d'information logistique du Client, incluant l'audit de l'existant, la conception "
    "de la nouvelle architecture, le développement et la formation des utilisateurs.",
    "Article 2 - Durée. Le contrat est conclu pour une durée de 18 mois à compter du "
    "1er mars 2025. Il pourra être reconduit une fois pour 6 mois par avenant signé "
    "des deux parties.",
    "Article 3 - Prix. Le montant total de la prestation est fixé à 48 000 euros hors "
    "taxes, soit 57 600 euros TTC. Ce montant est forfaitaire et non révisable, sauf "
    "modification du périmètre actée par avenant.",
    "Article 4 - Modalités de paiement. Le paiement s'effectue en trois échéances : "
    "30 % à la signature, 40 % à la validation de la recette, et 30 % à la fin de la "
    "période de garantie. Les factures sont payables à 45 jours fin de mois.",
    "Article 5 - Pénalités de retard. En cas de retard dans la livraison d'un jalon, le "
    "Prestataire sera redevable de pénalités égales à 1 % du montant total par semaine "
    "de retard, plafonnées à 10 % du montant total du contrat.",
    "Article 6 - Garantie. Le Prestataire garantit le bon fonctionnement des livrables "
    "pendant une période de 6 mois à compter de la recette définitive. Les anomalies "
    "bloquantes doivent être corrigées sous 48 heures ouvrées.",
    "Article 7 - Confidentialité. Chaque partie s'engage à garder confidentielles les "
    "informations échangées pendant toute la durée du contrat et pendant 5 ans après "
    "son terme.",
    "Article 8 - Propriété intellectuelle. Les développements spécifiques réalisés dans "
    "le cadre du contrat deviennent la propriété du Client au fur et à mesure de leur "
    "paiement.",
    "Article 9 - Résiliation. Chaque partie peut résilier le contrat moyennant un préavis "
    "de 3 mois notifié par lettre recommandée avec accusé de réception. En cas de "
    "manquement grave, la résiliation peut intervenir sans préavis après une mise en "
    "demeure restée sans effet pendant 15 jours.",
    "Article 10 - Interlocuteurs. Le chef de projet côté Client est M. Julien Marchetti. "
    "Le chef de projet côté Prestataire est Mme Sofia Lindqvist.",
    "Article 11 - Droit applicable et litiges. Le contrat est soumis au droit français. "
    "Tout litige sera porté devant le tribunal de commerce de Lyon.",
]

# --------------------------------------------------------------------------
# 3. Rapport annuel (PDF texte, avec des chiffres 2024 servant de distracteurs)
# --------------------------------------------------------------------------

RAPPORT_SECTIONS = [
    ("Rapport annuel 2025 - Atelier Lumen", ""),
    (
        "1. Message de la direction",
        "L'année 2025 a été marquée par une croissance solide malgré un contexte "
        "économique incertain. Atelier Lumen conçoit et fabrique des luminaires "
        "architecturaux pour les bâtiments tertiaires. Notre présidente, Mme Hélène "
        "Brossard, a fixé trois priorités : l'export, l'éco-conception et la "
        "fidélisation des équipes.",
    ),
    (
        "2. Chiffres clés",
        "Le chiffre d'affaires 2025 s'établit à 12,4 millions d'euros, en hausse de 8 % "
        "par rapport à 2024, année où il s'élevait à 11,5 millions d'euros. Le résultat "
        "net 2025 atteint 940 000 euros, contre 610 000 euros en 2024. La marge brute "
        "progresse à 41 % (39 % en 2024). L'effectif au 31 décembre 2025 est de 87 "
        "salariés, contre 79 un an plus tôt.",
    ),
    (
        "3. Répartition du chiffre d'affaires",
        "La France représente 64 % du chiffre d'affaires, l'Europe hors France 29 % et "
        "le reste du monde 7 %. L'Allemagne est devenue le premier marché export, devant "
        "la Belgique et la Suisse. La gamme Orbis représente à elle seule 38 % des ventes, "
        "la gamme Linéa 27 % et les projets sur mesure 35 %.",
    ),
    (
        "4. Investissements",
        "Atelier Lumen a investi 1,8 million d'euros en 2025, dont 1,1 million dans une "
        "nouvelle ligne de peinture poudre à Vénissieux et 400 000 euros dans le "
        "renouvellement du parc informatique. Le reste a financé la refonte du système "
        "d'information logistique, confiée au cabinet Nordique Conseil.",
    ),
    (
        "5. Environnement",
        "La consommation d'énergie du site de production a baissé de 14 % grâce à la "
        "récupération de chaleur sur les fours. 92 % des déchets de production sont "
        "désormais valorisés. L'objectif est d'atteindre 100 % d'aluminium recyclé dans "
        "les gammes Orbis et Linéa d'ici fin 2027.",
    ),
    (
        "6. Ressources humaines",
        "Le taux de turnover est passé de 11 % en 2024 à 7 % en 2025. 23 recrutements "
        "ont été réalisés, dont 9 en production et 6 au bureau d'études. L'index égalité "
        "professionnelle atteint 91 sur 100. Le nombre moyen d'heures de formation par "
        "salarié est de 26 heures.",
    ),
    (
        "7. Perspectives 2026",
        "Pour 2026, la direction vise un chiffre d'affaires de 13,5 millions d'euros. "
        "Le lancement de la gamme Atlas, destinée aux espaces extérieurs, est prévu le "
        "2 juin 2026. Une filiale commerciale sera ouverte à Munich au second semestre "
        "2026.",
    ),
    (
        "8. Gouvernance",
        "Le comité de direction compte 6 membres. Le conseil de surveillance s'est réuni "
        "4 fois en 2025. Les commissaires aux comptes sont le cabinet Rhône Audit "
        "Associés. Aucun dividende n'a été versé au titre de l'exercice 2025 afin de "
        "financer les investissements.",
    ),
]

# --------------------------------------------------------------------------
# 4. Facture scannée (PDF image, 2 pages) et 5. compte rendu (PNG)
# --------------------------------------------------------------------------

FACTURE_PAGE_1 = """FACTURE N° F-2025-0412
Date d'émission : 15/09/2025
Échéance : 30/10/2025

Émetteur : Nordique Conseil SARL
8 rue de la Liberté, 59000 Lille

Client : Atelier Lumen SAS
42 quai Perrache, 69002 Lyon

Désignation                         Qté    Prix unitaire HT    Total HT
Audit du système logistique          1         4 800,00         4 800,00
Ateliers de conception               6           650,00         3 900,00
Développement module stock          12           540,00         6 480,00

Total HT : 15 180,00 euros
TVA 20 % : 3 036,00 euros
Total TTC : 18 216,00 euros"""

FACTURE_PAGE_2 = """CONDITIONS DE RÈGLEMENT

Paiement par virement bancaire à 45 jours fin de mois.
IBAN : FR76 3000 4000 0500 0012 3456 789
BIC : BNPAFRPPXXX

En cas de retard de paiement, une pénalité égale à trois fois
le taux d'intérêt légal sera appliquée, ainsi qu'une indemnité
forfaitaire pour frais de recouvrement de 40 euros.

Pas d'escompte pour paiement anticipé.
Référence contrat : CP-2025-018"""

COMPTE_RENDU = """Compte rendu - Comité produit du 14 mars 2026

Présents : H. Brossard, J. Marchetti, C. Vasseur, L. Morel

1. Gamme Atlas : lancement confirmé le 2 juin 2026.
   Prix public de la borne Atlas 900 : 1 290 euros HT.
2. Budget marketing du lancement : 25 000 euros.
3. Salon Light + Building de Francfort : stand de 36 m².
4. Fournisseur des LED retenu : Lumitek (délai 6 semaines).

Prochaine réunion : 11 avril 2026, salle Saône."""


def _render_text_page(text: str, fontsize: float = 11) -> fitz.Pixmap:
    """Dessine un texte sur une page A4 puis la rasterise en niveaux de
    gris à 120 dpi - l'équivalent d'un scan de bureau ordinaire."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_textbox(fitz.Rect(56, 56, 540, 800), text, fontsize=fontsize, fontname="cour")
    pix = page.get_pixmap(dpi=120, colorspace=fitz.csGRAY)
    doc.close()
    return pix


def _write_scanned_pdf(path: Path, pages: list[str]) -> None:
    out = fitz.open()
    for text in pages:
        pix = _render_text_page(text)
        page = out.new_page(width=595, height=842)
        page.insert_image(page.rect, pixmap=pix)
    out.save(path)
    out.close()


def _write_png(path: Path, text: str) -> None:
    doc = fitz.open()
    page = doc.new_page(width=595, height=420)
    page.insert_textbox(fitz.Rect(30, 30, 570, 400), text, fontsize=11, fontname="cour")
    page.get_pixmap(dpi=130).save(path)
    doc.close()


def _write_docx(path: Path) -> None:
    doc = DocxDocument()
    for i, para in enumerate(CONTRAT_PARAGRAPHES):
        if i == 0:
            doc.add_heading(para, level=1)
        else:
            doc.add_paragraph(para)
    doc.save(path)


def _write_text_pdf(path: Path) -> None:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    for title, body in RAPPORT_SECTIONS:
        if not body:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 18)
            pdf.multi_cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
            continue
        pdf.set_font("Helvetica", "B", 13)
        pdf.multi_cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.multi_cell(0, 6, body, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)
    pdf.output(str(path))


def build(target: Path) -> list[dict]:
    """Écrit les 5 documents dans `target` et renvoie leur description."""
    target.mkdir(parents=True, exist_ok=True)
    (target / "politique_rh.md").write_text(POLITIQUE_RH, encoding="utf-8")
    _write_docx(target / "contrat_prestation.docx")
    _write_text_pdf(target / "rapport_annuel_2025.pdf")
    _write_scanned_pdf(target / "facture_scannee.pdf", [FACTURE_PAGE_1, FACTURE_PAGE_2])
    _write_png(target / "compte_rendu_comite.png", COMPTE_RENDU)
    return [
        {"file": "politique_rh.md", "kind": "texte"},
        {"file": "contrat_prestation.docx", "kind": "word"},
        {"file": "rapport_annuel_2025.pdf", "kind": "pdf_texte"},
        {
            "file": "facture_scannee.pdf",
            "kind": "pdf_scanne",
            "ground_truth": FACTURE_PAGE_1 + "\n" + FACTURE_PAGE_2,
            "pages": 2,
        },
        {
            "file": "compte_rendu_comite.png",
            "kind": "image",
            "ground_truth": COMPTE_RENDU,
            "pages": 1,
        },
    ]
