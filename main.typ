/*
=== NOTICE ===
This template uses the Font Awesome 7 Desktop icons 
You can download the fonts here: https://fontawesome.com/download
You either need to install them on your system, or upload them
to your project folder if you use the Typst web app.
*/

#import "@preview/lavandula:0.1.1": *
#import "content/typ/about.typ": *

#import "@preview/tenv:0.1.2": parse_dotenv

#let env = parse_dotenv(read(".env"))

#show: lavandula-theme.with(
  custom-colors: (
    primary: rgb("#0EA5E9"),
    secondary: rgb("#F0F9FF"),
  ),
)

#set text(lang: "en")
#set document(
  title: "Chadi Manglé (CV)",
  author: "Chadi Manglé",
  date: none,
)

#cv(
  sidebar-position: "left",
  sidebar: [
    = Chadi Manglé
    ==== #cv-headline
    
    #let phone-link = "tel:" + env.phone.replace(" ", "")
    #contact-list((
      (icon: "phone", text: link(phone-link)[#env.phone]),
      (icon: "envelope", icon-solid: true, text: link("mailto:chadimangled@gmail.com")[chadimangled\@gmail.com]),
      (icon: "github", text: link("https://github.com/Chadi-Mangle")[github.com/Chadi-Mangle]),
      (icon: "linkedin", text: link("https://www.linkedin.com/in/chadi-mangle/")[linkedin.com/in/chadi-mangle]),

      //(icon: "location-dot", icon-solid: true, text: "Paris, France"),
    ))

    #sidebar-section(title: "About me")[
      #set par(justify: true)
      #show par: it => block(width: 100%, it)

      #about-me
      
    ]

    #sidebar-section(title: "Technical skills")[
      #for (name, icon, skills) in yaml("content/yaml/skills.yml") [
        #skill-group(
          name: name,
          icon: icon,
          skills: skills,
        )
      ]
    ]
    
  ],
  
  main-content: [
    #section(title: "Career Objective")[

    #career-objective
    
    ]
    
    #section(title: "Experience")[
      #for exp in yaml("content/yaml/experience.yml") [
        #section-element(
          title: exp.title,
          info: [_#{exp.info}_],
          [
            #exp.description
            #set text(size: sizes.text-s2)
            #icon-list(
              exp.items.map(item => (
                icon: item.icon,
                text: if "title" in item [ #highlight[#item.title]: #item.text ] else [ #item.text ]
              ))
            )
          ]
        )
      ]
    ]

    #section(title: "Education")[
      #for edu in yaml("content/yaml/education.yml") [
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
   
    #section(title: "Projects")[
      #for (title, items) in yaml("content/yaml/projects.yml") {
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