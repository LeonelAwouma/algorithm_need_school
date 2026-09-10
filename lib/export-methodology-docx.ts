'use client'

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { KEY_INDICATORS, MENU_SECTIONS, METHOD_RULES } from '@/lib/methodology'

export async function downloadMethodologyDocx() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Méthodologie — Planification des enseignants', heading: HeadingLevel.TITLE }),
          new Paragraph({ text: 'Année scolaire 2024–2025', spacing: { after: 300 } }),

          new Paragraph({ text: 'Comprendre les indicateurs clés', heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 100 } }),
          new Paragraph({
            spacing: { after: 300 },
            children: [new TextRun("Les quatre indicateurs suivants apparaissent sur le tableau de bord. Chacun s'appuie sur le précédent : on part des écoles publiques, on ne garde que celles qu'on peut réellement calculer, on en déduit un besoin, puis un vivier d'enseignants pour le combler.")],
          }),
          ...KEY_INDICATORS.flatMap(item => [
            new Paragraph({ text: item.term, heading: HeadingLevel.HEADING_2, spacing: { before: 200 } }),
            new Paragraph({ children: [new TextRun({ text: item.summary, italics: true })], spacing: { after: 80 } }),
            new Paragraph({ text: item.explanation, spacing: { after: 200 } }),
          ]),

          new Paragraph({ text: 'Que trouve-t-on dans chaque page ?', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 100 } }),
          ...MENU_SECTIONS.flatMap(item => [
            new Paragraph({
              spacing: { before: 120 },
              children: [new TextRun({ text: item.label + ' — ', bold: true }), new TextRun(item.description)],
            }),
          ]),

          new Paragraph({ text: 'Règles précises appliquées par le moteur', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 100 } }),
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun('Pour les lecteurs qui veulent le détail exact des calculs et des limites connues.')],
          }),
          ...METHOD_RULES.flatMap(rule => [
            new Paragraph({
              spacing: { before: 120 },
              children: [new TextRun({ text: rule.title + ' — ', bold: true }), new TextRun(rule.text)],
            }),
          ]),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'methodologie-planification-enseignants.docx'
  link.click()
  URL.revokeObjectURL(url)
}
