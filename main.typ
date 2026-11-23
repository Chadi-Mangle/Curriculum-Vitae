/*
=== NOTICE ===
This template uses the Font Awesome 7 Desktop icons.
You can download the fonts here: https://fontawesome.com/download
Place the font files in `font/` and compile with `--font-path font`.
Personal contact metadata is loaded from `content/yaml/info.yml` (gitignored).
*/

#import "@preview/lavandula:0.1.1": *
#import "content/typ/about.typ": *

#let data-dir = sys.inputs.at("data-dir", default: "content/yaml")
#let info-file = sys.inputs.at("info-file", default: "content/yaml/info.yml")
#let info = yaml(info-file)
#let about-file = sys.inputs.at("about-file", default: none)
#let about-data = if about-file != none { yaml(about-file) } else { none }

#let render-inline(text) = {
  let parts = text.split("[[")
  for (i, part) in parts.enumerate() {
    if i == 0 {
      [#part]
    } else {
      let split = part.split("]]")
      if split.len() >= 2 {
        highlight[#split.at(0)]
        [#split.slice(1).join("]]")]
      } else {
        [#("[[" + part)]
      }
    }
  }
}

#let active-lang = if about-data != none { about-data.at("lang", default: "en") } else { "en" }
#let active-headline = if about-data != none { [#about-data.headline] } else { cv-headline }
#let active-about-me = if about-data != none { render-inline(about-data.about_me) } else { about-me }
#let active-profile = if about-data != none { render-inline(about-data.profile) } else { profile }
#let section-titles = if about-data != none { about-data.at("sections", default: (:)) } else { (:) }

#show: lavandula-theme.with(
  custom-colors: (
    primary: rgb("#0EA5E9"),
    secondary: rgb("#F0F9FF"),
  ),
)

#set text(lang: active-lang)
#set document(
  title: info.full_name + " (CV)",
  author: info.full_name,
  date: none,
)

#cv(
  sidebar-position: "left",
  sidebar: [
    = #info.full_name
    ==== #active-headline

    #let phone-link = "tel:" + info.phone.replace(" ", "")
    #let github-url = if info.github.starts-with("http") { info.github } else { "https://" + info.github }
    #let linkedin-url = if info.linkedin.starts-with("http") { info.linkedin } else { "https://" + info.linkedin }
    #contact-list((
      (icon: "phone", text: link(phone-link)[#info.phone]),
      (icon: "envelope", icon-solid: true, text: link("mailto:" + info.email)[#info.email]),
      (icon: "github", text: link(github-url)[#info.github]),
      (icon: "linkedin", text: link(linkedin-url)[#info.linkedin]),
    ))

    #sidebar-section(title: section-titles.at("about_me", default: "About me"))[
      #set par(justify: true)
      #show par: it => block(width: 100%, it)

      #active-about-me
    ]

    #sidebar-section(title: section-titles.at("skills", default: "Technical skills"))[
      #for (name, icon, skills) in yaml(data-dir + "/skills.yml") [
        #skill-group(
          name: name,
          icon: icon,
          skills: skills,
        )
      ]
    ]
  ],

  main-content: [
    #section(title: section-titles.at("profile", default: "Profile"))[
      #active-profile
    ]

    #section(title: section-titles.at("experience", default: "Experience"))[
      #for exp in yaml(data-dir + "/experience.yml") [
        #section-element(
          title: exp.title,
          info: emph(str(exp.at("info", default: ""))),
          [
            #exp.at("description", default: "")
            #set text(size: sizes.text-s2)
            #icon-list(
              exp.at("items", default: ()).map(item => (
                icon: item.icon,
                text: if "title" in item [ #highlight[#item.title]: #item.text ] else [ #item.text ]
              ))
            )
          ]
        )
      ]
    ]

    #section(title: section-titles.at("education", default: "Education"))[
      #for edu in yaml(data-dir + "/education.yml") [
        #section-element-advanced(
          title: edu.title,
          info-top-left: edu.at("info_top_left", default: ""),
          info-top-right: edu.at("info_top_right", default: ""),
          [
            #set text(size: sizes.text-s2)
            #if "degree" in edu [
              _#{edu.degree}_ #{edu.at("comment", default: "")}
            ]
            #if "items" in edu [
              #icon-list(
                edu.items.map(item => (
                  icon: item.icon,
                  text: [_#{item.text}_]
                ))
              )
            ]
          ]
        )
      ]
    ]

    #section(title: section-titles.at("projects", default: "Projects"))[
      #for (title, items) in yaml(data-dir + "/projects.yml") {
        section-element(title: title)[
          #set text(size: sizes.text-s2)
          #icon-list(
            items.map(((name, icon, description)) => (
              icon: icon,
              text: [#highlight[#name]: #description]
            ))
          )
        ]
      }
    ]
  ],
)
