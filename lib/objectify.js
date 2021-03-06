function objectify() {

  const fse = require('fs-extra');
  const path = require('path');
  const chalk = require('chalk');
  const cheerio = require("cheerio");

   //In the regex below, Group 2 is the href attribute value and Group 4 is the text
  const ANCHOR_REGEX = new RegExp(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1([^>]*)?>(.*?)<\/a>/g)

  let book = []

  fse.readFile(path.join('interim', 'sanitized.html'), 'utf8')
    .then((contents) => {
      contents = contents.replace(ANCHOR_REGEX, '<a href="$2">$4</a>')
      const $ = cheerio.load(contents, {
        decodeEntities: false
      });
      let index = 0;
      $('body').children().each((i, elem) => {
       
        let val = '';
        let key = $(elem)[0].name;

        switch (key) {

          case 'p': case 'hr': case 'pre': case 'code': case 'blockquote': case 'cite': case 'div':
            val = $(elem).html().trim();
            break;

          case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h5': case 'h6':
            val = $(elem).html().trim();
            val = titleCaseText(val)
            break;

          case 'img':
            val = $(elem).attr('src');
            break;

          case 'ol': case 'ul':
            let startIndex = $(elem).attr('start')
            let olObj = []
            let liIndex = 0
            $(elem).find('li').each(function (i, elm) {
              olObj[liIndex++] = $(this).text().trim()
            });
            val = {}
            val.start = startIndex;
            val.list = olObj;
            break;

          case 'br':
            console.log('Line break here?')
            break;

          default:
            console.log('We have a situation Houston.', key, i)
        }

        book.push({ tag: key, innerHtml: val });

        let nextElement = $(elem)[0].next;
        if (nextElement && nextElement.type == 'text' && nextElement.data.trim() != '')
          book.push({ tag: 'p', innerHtml: nextElement.data.trim() });
      });

      function titleCaseText(str) {
        const romanNumeral = new RegExp(/^(M{1,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})|M{0,4}(CM|C?D|D?C{1,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})|M{0,4}(CM|CD|D?C{0,3})(XC|X?L|L?X{1,3})(IX|IV|V?I{0,3})|M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|I?V|V?I{1,3}))\.?$/gm)

        return str.toLowerCase().split(' ').map(function (word) {
          if (word.toUpperCase().match(romanNumeral)) { return word.toUpperCase() }
          let firstLetter = word.match('[A-Za-z]{1}')
          if(firstLetter)
            return word.replace(firstLetter[0], firstLetter[0].toUpperCase());
          else return word
        }).join(' ');
      }


    }).then(() => {

      fse.mkdirs(path.join('interim', 'tmp'))
        .then(() => {
          fse.writeFile(path.join('.', 'interim', 'tmp', '.prebook'), JSON.stringify(book, null, 2))
            .then(() => {
              console.log(chalk.blue('Prebook object saved.'));
            }).catch((err) => {
              if (err)
                return console.log(chalk.bold.red('Failed to write book URL', err));
            });
        })
        .catch((err) => {
          if (err)
            return console.log(chalk.bold.red('Failed to write book URL', err));

        });


    }).catch((err) => {
      if (err)
        console.log(chalk.bold.red('Failed to pick up contents', err));

    })


}

module.exports.objectify = objectify; // Should return boolean true/false