/*
=== Cover Letter Template — Matched to Lavandula CV ===
Uses the exact same color palette (#0EA5E9 / #F0F9FF), Fira Sans typography,
and Font Awesome 7 icons as main.typ.
Personal contact metadata is loaded from `content/yaml/info.yml` (gitignored).

Compile:
  typst compile cover-letter.typ output/cover-letter.pdf \
    --font-path font \
    --input letter-file=output/bundles/<slug>/cover-letter.yml
*/

#import "@preview/lavandula:0.1.1": *
#import "@preview/fontawesome:0.6.0": *

#let info-file = sys.inputs.at("info-file", default: "content/yaml/info.yml")
#let info = yaml(info-file)
#let letter-file = sys.inputs.at("letter-file", default: "content/yaml/cover-letter.yml")
#let data = yaml(letter-file)

#let primary-color = rgb("#0EA5E9")
#let secondary-color = rgb("#F0F9FF")
#let dark-color = rgb("#202020")
#let muted-color = rgb("#52525B")

#let render-inline(raw) = {
  // Keep body prose clean and sober (no inline bold/colored highlights inside paragraphs)
  let parts = str(raw).split("[[")
  for (i, part) in parts.enumerate() {
    if i == 0 {
      [#part]
    } else {
      let split = part.split("]]")
      if split.len() >= 2 {
        [#split.at(0)]
        [#split.slice(1).join("]]")]
      } else {
        [#("[[" + part)]
      }
    }
  }
}

#let active-lang = data.at("lang", default: "en")
#let city = info.at("city", default: "Paris")

#set page(
  paper: "a4",
  margin: (top: 0pt, bottom: 16mm, left: 0pt, right: 0pt),
  fill: rgb("#fefcfc"),
)

#set text(
  font: ("Fira Sans", "Liberation Sans", "DejaVu Sans"),
  size: 9.5pt,
  fill: dark-color,
  lang: active-lang,
)

#set document(
  title: data.at("doc_title", default: info.full_name + " — Motivation Letter"),
  author: info.full_name,
  date: none,
)

// Top header band matching lavandula sidebar styling
#block(
  width: 100%,
  fill: secondary-color,
  stroke: (bottom: 2pt + primary-color),
  inset: (x: 20mm, top: 13mm, bottom: 10mm),
)[
  #grid(
    columns: (1fr, auto),
    gutter: 12pt,
    align: (bottom + left, bottom + right),
    [
      #text(size: 21pt, weight: "bold", fill: primary-color)[#info.full_name]
      #v(-4pt)
      #text(size: 10.5pt, weight: "medium", fill: muted-color)[#data.at("headline", default: "Systems & Cloud-Native Engineer — PhD Candidate")]
    ],
    [
      #set text(size: 8.5pt, fill: dark-color)
      #let phone-link = "tel:" + info.phone.replace(" ", "")
      #let github-url = if info.github.starts-with("http") { info.github } else { "https://" + info.github }
      #let linkedin-url = if info.linkedin.starts-with("http") { info.linkedin } else { "https://" + info.linkedin }
      #stack(
        dir: ttb,
        spacing: 4.5pt,
        [#fa-icon("phone", fill: primary-color) #h(4pt) #link(phone-link)[#info.phone]],
        [#fa-icon("envelope", solid: true, fill: primary-color) #h(4pt) #link("mailto:" + info.email)[#info.email]],
        [#fa-icon("github", fill: primary-color) #h(4pt) #link(github-url)[#info.github]],
        [#fa-icon("linkedin", fill: primary-color) #h(4pt) #link(linkedin-url)[#info.linkedin]],
      )
    ],
  )
]

// Main letter body
#pad(x: 20mm, top: 10mm)[
  // Recipient + Date bar
  #grid(
    columns: (1fr, auto),
    gutter: 10pt,
    align: (top + left, top + right),
    [
      #text(size: 8.5pt, weight: "semibold", fill: primary-color)[#upper(data.at("to_label", default: "To"))]
      #v(-3pt)
      #text(size: 9.5pt, weight: "semibold")[#data.recipient]
      #if "institution" in data [
        \ #text(size: 9pt, fill: muted-color)[#data.institution]
      ]
      #if "location" in data [
        \ #text(size: 8.5pt, fill: muted-color)[#data.location]
      ]
    ],
    [
      #let default-date = city + ", " + datetime.today().display("[month repr:long] [day], [year]")
      #text(size: 9pt, fill: muted-color)[#data.at("date", default: default-date)]
      #if "reference" in data [
        \ #text(size: 8.5pt, fill: primary-color, weight: "medium")[#data.reference]
      ]
    ],
  )

  #v(10pt)

  // Subject banner
  #block(
    width: 100%,
    fill: secondary-color,
    stroke: (left: 3pt + primary-color),
    inset: (x: 10pt, y: 7pt),
    radius: (right: 3pt),
  )[
    #text(size: 9.5pt, weight: "semibold", fill: dark-color)[
      #text(fill: primary-color)[#data.at("subject_label", default: "Subject:")] #data.subject
    ]
  ]

  #v(12pt)

  // Salutation
  #data.salutation

  #v(6pt)

  // Paragraphs (flowing prose only — no bullet points or inline highlights)
  #set par(justify: true, leading: 0.72em, spacing: 10.5pt)
  #for para in data.paragraphs [
    #render-inline(para)

  ]

  #if "closing_paragraphs" in data [
    #for para in data.closing_paragraphs [
      #render-inline(para)

    ]
  ]

  #v(10pt)

  // Sign-off
  #data.at("closing", default: "Sincerely,")
  #v(8pt)
  #text(size: 11pt, weight: "bold", fill: primary-color)[#info.full_name]
  #if "signature_subtitle" in data [
    \ #text(size: 8.5pt, fill: muted-color)[#data.signature_subtitle]
  ]
]
