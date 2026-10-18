# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product.spec.js >> capsule surface copies canonical URL, keyboard copies, Open navigates independently
- Location: tests/ui/product.spec.js:8:1

# Error details

```
Test timeout of 45000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - generic [ref=e4]:
    - banner [ref=e5]:
      - link "PURL home" [ref=e6] [cursor=pointer]:
        - /url: /
        - text: PURL
        - generic [ref=e8]: .
      - generic [ref=e9]:
        - button "Guest session" [ref=e10] [cursor=pointer]
        - button "Toggle navigation" [ref=e13] [cursor=pointer]
    - main [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]:
          - generic [ref=e19]: A NEW KIND OF ADDRESS
          - heading [level=1] [ref=e20]:
            - text: Ideas become
            - emphasis [ref=e21]: living
            - text: URLs.
          - paragraph [ref=e22]: A program. A possibility. A place to pick upwhere you left off. All in one beautiful link.
          - generic [ref=e23]:
            - link "Create a PURL" [ref=e24] [cursor=pointer]:
              - /url: /create
              - text: Create a PURL
              - generic [aria-hidden] [ref=e25]: ↗︎
            - link "Explore the possibilities" [ref=e26] [cursor=pointer]:
              - /url: /explore
              - text: Explore the possibilities
              - generic [aria-hidden] [ref=e27]: ↗︎
          - generic [ref=e28]:
            - generic [aria-hidden] [ref=e29]: ✧
            - text: Made for humans. Open to every kind of mind.
        - img "An iridescent pearl surrounded by fine orbital rings, a visual metaphor for an idea with its own address" [ref=e30]:
          - generic [ref=e36]:
            - generic [ref=e38]: purl / a-little-possibility
            - generic [aria-hidden] [ref=e39]: ↗︎
          - generic [aria-hidden] [ref=e40]: ONE ADDRESS. ENDLESS CONTINUATIONS.
          - generic [aria-hidden] [ref=e41]: THOUGHT → PROGRAM → POSSIBILITY
      - generic [ref=e43]:
        - generic [ref=e44]:
          - text: More than a link.
          - emphasis [ref=e45]: A living thing.
        - generic [ref=e46]:
          - generic [ref=e47]:
            - generic [aria-hidden] [ref=e48]: ⌘
            - text: Create something real
          - generic [ref=e49]:
            - generic [aria-hidden] [ref=e50]: ↗︎
            - text: Share the whole possibility
          - generic [ref=e51]:
            - generic [aria-hidden] [ref=e52]: ∞
            - text: Continue from anywhere
      - generic [ref=e53]:
        - generic [ref=e54]:
          - generic [ref=e55]:
            - generic [ref=e56]: SMALL PROGRAMS. OPEN POSSIBILITIES.
            - heading "A few things that live here." [level=2] [ref=e57]
          - link "Explore all PURLs" [ref=e58] [cursor=pointer]:
            - /url: /explore
            - text: Explore all PURLs
            - generic [aria-hidden] [ref=e59]: ↗︎
        - generic [ref=e60]:
          - article [ref=e61]:
            - button "Copy canonical URL for PURL · The God Seed" [ref=e62]
            - generic:
              - generic: MISSION
              - generic: built
            - generic:
              - heading "PURL · The God Seed" [level=3]
              - paragraph: A living mission. Every next step, carried forward.
              - generic: /p/godseed-mission
            - link "Open PURL · The God Seed" [ref=e63] [cursor=pointer]:
              - /url: /p/godseed-mission
              - text: Open
              - generic [aria-hidden] [ref=e64]: ↗︎
          - article [ref=e65]:
            - button "Copy canonical URL for A little arithmetic" [ref=e66]
            - generic:
              - generic: PURL PROGRAM
              - generic: built
            - generic:
              - heading "A little arithmetic" [level=3]
              - paragraph: Small operations. Beautifully composed.
              - generic: /p/math-demo
            - link "Open A little arithmetic" [ref=e67] [cursor=pointer]:
              - /url: /p/math-demo
              - text: Open
              - generic [aria-hidden] [ref=e68]: ↗︎
          - article [ref=e69]:
            - button "Copy canonical URL for Tic-tac-toe, together" [ref=e70]
            - generic:
              - generic: GAME
              - generic: built
            - generic:
              - heading "Tic-tac-toe, together" [level=3]
              - paragraph: A shared game. Your next move is a URL away.
              - generic: /p/tic-tac-toe
            - link "Open Tic-tac-toe, together" [ref=e71] [cursor=pointer]:
              - /url: /p/tic-tac-toe
              - text: Open
              - generic [aria-hidden] [ref=e72]: ↗︎
        - paragraph [ref=e73]: Tap anywhere on a capsule to copy its URL. Open to look inside.
      - generic [ref=e77]:
        - heading [level=2] [ref=e78]:
          - text: The internet gave everythingan address.
          - emphasis [ref=e79]: Now, a little agency.
        - paragraph [ref=e80]:
          - text: PURLs hold more than information. They hold a program, its history, and the next possible step. Open one, see how it works, and make something of your own.
          - link "Meet the idea behind PURL" [ref=e81] [cursor=pointer]:
            - /url: /docs
            - text: Meet the idea behind PURL
            - generic [aria-hidden] [ref=e82]: ↗︎
    - contentinfo [ref=e83]:
      - generic [ref=e84]:
        - link "PURL ." [ref=e85] [cursor=pointer]:
          - /url: /
          - text: PURL
          - generic [ref=e87]: .
        - generic [ref=e88]: Programmable URLs. Pronounced pearl.
      - generic [ref=e89]:
        - link "How it works" [ref=e90] [cursor=pointer]:
          - /url: /docs
        - link "Protocol ↗︎" [ref=e91] [cursor=pointer]:
          - /url: /.well-known/purl
        - link "Observatory" [ref=e92] [cursor=pointer]:
          - /url: /observatory
        - generic [ref=e93]: LIVE SERVICE
  - status
```