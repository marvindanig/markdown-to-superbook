async function pagify() {
  const fse = require('fs-extra');
  const path = require('path');
  const chalk = require('chalk');

  const puppeteer = require('puppeteer');

  const spanStart = '<span class="pagy"';
  const lastSpanStart = '<span class="pagy last-pagy"';
  const spanEnd = '</span>';
  const hrHtml = '<hr class="section">'
  // const hrefRegex = href_regex = /<a([^>]*?)href\s*=\s*(['"])([^\2]*?)\2\1*>/i;
  // const anchorTagRegex = /<a[^>]*>/g
  // const anchorTagEndRegex = /<\/a>/g

  let book = {}, index = {};

  const pageTemplateHtml = await fse.readFile(path.join(__dirname, '..', 'templates', 'pagy-template.html'), 'utf-8');

  const bookrc = await fse.readJson(path.join('.', '.bookrc')).catch(err => {
    if (err) console.log(chalk.red('Could not read .bookrc ', err));
  })
  const startPage = bookrc && bookrc.start_page ? parseInt(bookrc.start_page) : 9

  const prebook = await fse.readJson(path.join('.', 'interim', 'tmp', '.prebook')).catch(err => {
    if (err) console.log(chalk.red('Could not read .book json', err));
  })

  const bookLayoutTemplate = await fse.readFile(path.join('.', 'templates', 'style.css')).catch(err => {
    if (err) console.log(chalk.red('Could not read stle.css from templates', err));
  })
  const bookHeadTemplate = await fse.readFile(path.join('.', 'templates', 'head.html')).catch(err => {
    if (err) console.log(chalk.red('Could not read head.html from templates', err));
  })
  const PAGE_TEMPLATE_KEY = 'PAGE_INNER_HTML'
  const LAYOUT_TEMPLATE_KEY = 'BOOK_LAYOUT_TEMPLATE'
  const HEAD_TEMPLATE_KEY = 'BOOK_HEAD_TEMPLATE'
  const emptyPageHtml = pageTemplateHtml.replace(LAYOUT_TEMPLATE_KEY, bookLayoutTemplate)
    .replace(HEAD_TEMPLATE_KEY, bookHeadTemplate)

  let pageHtml = ''; // This is the finalized HTML for the page - this will only include content that fits
  let indexer = 0;
  let crashPageCounter = 0;
  let tagAdded = false, tagHtml = ''; // the flag is to check whether ol/ul tag needs to be added for this li

  const browser = await puppeteer.launch({headless:false});
  let page = await browser.newPage();
  await page.setViewport({ width: 462, height: 600 }); // Do not change these values.

  let pageCounter = startPage;
  let imageToAddNext = false, imageHtmlToAdd = '', pageHtmlToCheck = '', nextPage = false;

  for (const elem of prebook) {
    pageHtmlToCheck = pageHtml, // This is the HTML that is pageHtml + new tag html and will be checked with puppeteer
      htmltoAdd = '', // This is the new tag HTML that needs to be checked if fits
      tag = elem.tag;
      nextPage = false
    switch (tag) {
      case 'img':
        if (imageToAddNext) {
          finishPage(false)
        }
        let imgFormat = ''
        let imgNotContained = true
        do {
          htmltoAdd = `<img id="checkImg" `+ imgFormat + `src = "${elem.innerHtml}" />`
          if(nextPage) {
            pageHtmlToCheck = htmltoAdd
          } else {
            pageHtmlToCheck = pageHtml + htmltoAdd
          }
            
          const pageHtmlFromTemplate = emptyPageHtml.replace(PAGE_TEMPLATE_KEY, pageHtmlToCheck);
          await page.setContent(pageHtmlFromTemplate)
          const xy = await page.evaluate(() => {
            const pageDiv = $('div.inner')
            const pageDivEl = pageDiv[0]

            const visibleOffsetHeight = pageDivEl.offsetTop + pageDivEl.clientHeight
            
            let $currentSpan = $("#checkImg")
            const imgNeedsHeight = $currentSpan.offset().top + $currentSpan.height()
            const imgNeedsWidth = $currentSpan.offset().left + $currentSpan.width()

            let widthOverFlowing = imgNeedsWidth > pageDivEl.clientWidth
            let lengthOverFlowing = imgNeedsHeight > visibleOffsetHeight
            let isHeightLessThanHalfPage = $currentSpan.offset().top > pageDivEl.clientHeight/2
            let nextPageEval = false, imgFormatEval = '', imgNotContainedEval = true,
                  widthPercentEval = 100

            if(widthOverFlowing) {
              imgFormatEval = ' width = "100%" '
            } else if(lengthOverFlowing) {
              if(isHeightLessThanHalfPage) {
                nextPageEval = true;
              } else {
                widthPercentEval = widthPercentEval/2
                $currentSpan.width(widthPercentEval+'%')
                imgFormatEval = 'width ="' + widthPercentEval +'%" '
              }
            } else {
              imgNotContainedEval = false
            }
            return {imgNotContained: imgNotContainedEval, widthPercent: widthPercentEval, 
                      imgFormat: imgFormatEval, nextPage: nextPageEval}
          });
          imgNotContained = xy.imgNotContained
          widthPercent = xy.widthPercent
          imgFormat = xy.imgFormat
          nextPage = xy.nextPage
        } while (imgNotContained);

        if(nextPage) {
          imageToAddNext = true
          imageHtmlToAdd = `<img id="checkImg" `+ imgFormat + `src = "${elem.innerHtml}" />`
        }

      break;
      // case 'img':
      //   htmltoAdd = `<img width = "100%" src = "${elem.innerHtml}" />`
      //   if (imageToAddNext) {
      //     finishPage(false)
      //   }
      //   if (pageHtml !== '') { // Page has some content
      //     pageHtmlToCheck += htmltoAdd // page already has some content so need to check if it fits in page
      //     let isOverFlowing = await isContentOverflowing(pageHtmlToCheck)
      //     if (isOverFlowing) {
      //       imageToAddNext = true
      //       imageHtmlToAdd = htmltoAdd
      //     } else {
      //       pageHtml += htmltoAdd
      //     }
      //   } else {
      //     pageHtml = htmltoAdd // New page so add the entire image without checking with puppeteer
      //   }

      //   break;

      case 'h1': case 'h2':
        finishPage(true)
        pageHtml = `<${tag}>${elem.innerHtml}</${tag}>`;
        finishPage(true)
        break;

      case 'h3': case 'h4':
        finishPage(true)
        pageHtml = `<${tag}>${elem.innerHtml}</${tag}>`;
        index[indexer++] = `<li><a class = "page" href="${pageCounter}">${elem.innerHtml}</a> <span class="flex">${pageCounter}</span> </li>`;

        break;

      case 'hr':
        // Include the horizontal rule in the same page where chapter ends
        if (pageHtml != '')
          pageHtml += hrHtml;
        else {
          // If the chapter's content has already been included on last page, add the horizontal rule on the last page
          book[`page-${pageCounter - 1}`] += hrHtml;
        }

        break;

      case 'p': case 'code': case 'blockquote': case 'cite': case 'h5': case 'h6': case 'pre':

        let isParaNotContained = true, // Flag whether content is contained in current page
          paraContinued = false; // Flag whether content is continued from last page
        let pContent = elem.innerHtml;
        htmltoAdd = getIndentAndStretchParaHtml(tag, pContent, false, false)
        pageHtmlToCheck = pageHtml + getIndentAndStretchParaHtml(tag, getSpannedHtmlOfPara(pContent), false, false)

        do {
          const hiddenSpan = await getHiddenSpan(pageHtmlToCheck)
          if (hiddenSpan) {
            if (hiddenSpan != 0) {
              const selectedPara = getSelectedPara(pContent, hiddenSpan - 1);
              var selectedParaHtml = getHtmlOfPara(selectedPara);
              pContent = getRemainingPara(pContent, hiddenSpan);

              const adjustedInlineTags = adjustInlineTags(selectedParaHtml, pContent)
              selectedParaHtml = adjustedInlineTags.selectedHtml
              pContent = adjustedInlineTags.content

              pageHtml += getIndentAndStretchParaHtml(tag, selectedParaHtml, paraContinued, true)
              htmltoAdd = getIndentAndStretchParaHtml(tag, pContent, true, false)
              pageHtmlToCheck = getIndentAndStretchParaHtml(tag, getSpannedHtmlOfPara(pContent), true, false)
              paraContinued = true;
            } else {
              pageHtmlToCheck = getIndentAndStretchParaHtml(tag, getSpannedHtmlOfPara(pContent), paraContinued, false)
            }
            finishPage(false)
          } else {
            pageHtml += htmltoAdd;
            isParaNotContained = false;
            paraContinued = false;
          }

        } while (isParaNotContained);

        break;

      case 'ol': case 'ul':
        let list = elem.innerHtml.list;
        tagHtml = `<${tag}>`
        tagAdded = false

        for (const liIndex in list) {
          let currentliIndex = parseInt(liIndex) + 1;
          let isliNotContained = true, liContinued = false;
          let liContent = list[liIndex];
          let liHtml = `<li>${liContent}</li>`;
          pageHtmlToCheck = `${pageHtml}${tagHtml}<li>${getSpannedHtmlOfPara(liContent)}</li></${tag}>`;

          do {
            const hiddenSpan = await getHiddenSpan(pageHtmlToCheck)

            if (hiddenSpan) {
              if (hiddenSpan != 0) {
                const selectedliContent = getSelectedPara(liContent, hiddenSpan - 1);
                var selectedLiHtml = getHtmlOfPara(selectedliContent);
                liContent = getRemainingPara(liContent, hiddenSpan);

                const adjustedInlineTags = adjustInlineTags(selectedLiHtml, liContent)
                selectedLiHtml = adjustedInlineTags.selectedHtml
                liContent = adjustedInlineTags.content

                pageHtml += getSelectedSplitAndStretchListHtml(tag, currentliIndex, selectedLiHtml, liContinued, true, !tagAdded, true)
                liHtml = getSelectedSplitAndStretchListHtml(tag, currentliIndex, liContent, true, false, false, false)
                pageHtmlToCheck = getSelectedSplitAndStretchListHtml(tag, currentliIndex, getSpannedHtmlOfPara(liContent), true, false, true, true)
                liContinued = true;
              } else {
                pageHtmlToCheck = getSelectedSplitAndStretchListHtml(tag, currentliIndex, getSpannedHtmlOfPara(liContent), false, false, true, true)
                pageHtml += `</${tag}>`
              }
              finishPage(false)
              setTagAdded(false)
            } else {
              if (tagAdded) pageHtml += liHtml;
              else {
                let indexHtml = ''
                if (liIndex > 0 && tag == 'ol') indexHtml = ` style="--start:${currentliIndex}" start="${currentliIndex}"`
                pageHtml += `<${tag}${indexHtml}>${liHtml}`;
                setTagAdded(true)
              }
              isliNotContained = false;
              liContinued = false;
            }
          } while (isliNotContained);
        }
        pageHtml += `</${tag}>`;

        break;

      default:
        console.log("Unhandled tag encountered = " + tag);
    }
  }

  if (pageHtml != '') {
    book[`page-${pageCounter++}`] = pageHtml
  }
  await browser.close();

  await fse.writeFile(path.join('.', 'interim', 'tmp', '.book'), JSON.stringify(book, null, 2)).catch(err => {
    if (err) return console.log(chalk.bold.red('Failed to write .book json', err));
  })
  console.log(chalk.green(`Pagification… (.book) is ${chalk.blue('complete')}`));


  await fse.writeFile(path.join('.', 'interim', 'tmp', '.index'), JSON.stringify(index, null, 2)).catch(err => {
    if (err) return console.log(chalk.bold.red('Failed to write index json', err));
  })
  console.log(chalk.green(`A book.index was ${chalk.blue('prepared.')}`));

  function setTagAdded(newTagAdded) {
    tagAdded = newTagAdded;
    if (tagAdded)
      tagHtml = ''
    else
      tagHtml = `<${tag}>`
  }

  function getIndentAndStretchParaHtml(tag, selectedHtml, indent, stretch) {
    let stretchClass = '', indentClass = '';
    if (indent) indentClass = "no-indent"
    if (stretch) stretchClass = "stretch-last-line"
    if (indent || stretch)
      return `<${tag} class="${indentClass} ${stretchClass}">${selectedHtml}</${tag}>`
    else
      return `<${tag}>${selectedHtml}</${tag}>`
  }

  function finishPage(newChapter) {
    if (pageHtml !== '') {
      book[`page-${pageCounter++}`] = pageHtml
    }
    crashPageCounter += 1;
    checkCrashPageCounter(); // Puppeteer crashes after a few thousand pages so create a new page after 1000
    setNewPageHtml(newChapter)
  }

  function setNewPageHtml(newChapter) {
    pageHtml = ''
    if (imageToAddNext) {
      pageHtml = imageHtmlToAdd
      imageHtmlToAdd = ''
      imageToAddNext = false
      if (newChapter) {
        book[`page-${pageCounter++}`] = pageHtml
        pageHtml = ''
      }
      pageHtmlToCheck = pageHtml + pageHtmlToCheck
    }
  }

  function getSelectedSplitAndStretchListHtml(tag, currentliIndex, selectedLiHtml, split, stretch, tagStart, tagEnd) {
    let splitClass = '', stretchClass = '', tagEndHtml = '', tagStartHtml = ''
    if (split) splitClass = 'split-li'
    if (stretch) stretchClass = 'stretch-last-line'
    if (tagEnd) tagEndHtml = `</${tag}>`
    if (tag == 'ol') tagStartHtml = `<${tag} style="--start:${currentliIndex}" start="${currentliIndex}">`

    if (split || stretch) {
      if (tagStart) return `${tagStartHtml}<li class="${splitClass} ${stretchClass}">${selectedLiHtml}</li>${tagEndHtml}`;
      else return `<li class="${splitClass} ${stretchClass}">${selectedLiHtml}</li>${tagEndHtml}`;
    } else {
      if (tagStart) return `${tagStartHtml}<li>${selectedLiHtml}</li>${tagEndHtml}`;
      else return `<li>${selectedLiHtml}</li>${tagEndHtml}`;
    }
  }

  function adjustInlineTags(selectedHtml, content) {
    const lastIndexEm = selectedHtml.lastIndexOf('<em>');
    const lastIndexEmEnd = selectedHtml.lastIndexOf('</em>');

    const lastIndexStrong = selectedHtml.lastIndexOf('<strong>');
    const lastIndexStrongEnd = selectedHtml.lastIndexOf('</strong>');

    // const lastIndexAnchor = selectedHtml.lastIndexOf('<a');
    // const lastIndexAnchorEnd = selectedHtml.lastIndexOf('</a>');

    if (lastIndexEm != -1 && lastIndexEm > lastIndexEmEnd) {
      selectedHtml += selectedParaHtml + '</em>';
      content = '<em>' + content;
    }

    if (lastIndexStrong != -1 && lastIndexStrong > lastIndexStrongEnd) {
      selectedHtml += selectedHtml + '</em>';
      content = '<strong>' + content;
    }

    // if (lastIndexAnchor != -1 && lastIndexAnchor > lastIndexAnchorEnd) {
    //   selectedHtml += selectedHtml + '</a>';
    //   let anchorString = selectedHtml.substring(lastIndexAnchor)
    //   let href = anchorString.match(hrefRegex)

    //   content = `<a href="${href}">${content}`
    // }
    return { selectedHtml: selectedHtml, content: content }
  }

  async function checkCrashPageCounter() {
    if (crashPageCounter > 10000) {
      await page.close();
      page = await browser.newPage();
      await page.setViewport({ width: 462, height: 600 });
      crashPageCounter = 0;
    }
  }

  async function isContentOverflowing(pageHtmlToCheck) {
    const pageHtmlFromTemplate = emptyPageHtml.replace(PAGE_TEMPLATE_KEY, pageHtmlToCheck);
    await page.setContent(pageHtmlFromTemplate);
    return page.evaluate(() => {
      const pageDiv = $('div.inner');
      const pageDivEl = pageDiv[0];
      const isPageDivOverflowing =
        pageDivEl.clientHeight < pageDivEl.scrollHeight;
      return isPageDivOverflowing;
    });
  }

  async function getHiddenSpan(pageHtmlToCheck) {
    const pageHtmlFromTemplate = emptyPageHtml.replace(PAGE_TEMPLATE_KEY, pageHtmlToCheck);
    await page.setContent(pageHtmlFromTemplate)
    return page.evaluate(() => {
      const pageDiv = $('div.inner')
      const pageDivEl = pageDiv[0]
      const isPageDivOverflowing = pageDivEl.clientHeight < pageDivEl.scrollHeight
      if (isPageDivOverflowing) {
        const visibleOffset = pageDivEl.offsetTop + pageDivEl.clientHeight
        let firstHiddenSpan;
        $.each($('div.inner span.pagy'), (i, currentSpan) => {
          const $currentSpan = $(currentSpan)
          const spanNeeds = $currentSpan.offset().top + $currentSpan.height()
          if (spanNeeds > visibleOffset) {
            firstHiddenSpan = $currentSpan.attr('id')
            return false
          }
        }
        );
        return firstHiddenSpan;
      }
    });
  }

  function getSpannedHtmlOfPara(paraHtml) {
    //wrap all words with span
    let spannedHtml = '';
    // paraHtml = paraHtml.replace(anchorTagRegex, '')
    // paraHtml = paraHtml.replace(anchorTagEndRegex, '')
    const words = paraHtml.split(' ');
    const lastIndex = words.length - 1;
    words.forEach((v, i) => {
      if (spannedHtml === '')
        if (i == lastIndex) spannedHtml = `${spannedHtml}${lastSpanStart} id="${i}">${v}${spanEnd}`;
        else spannedHtml = `${spannedHtml}${spanStart} id="${i}">${v}${spanEnd}`;
      else {
        if (i == lastIndex) spannedHtml = `${spannedHtml}${lastSpanStart} id="${i}"> ${v}${spanEnd}`;
        else spannedHtml = `${spannedHtml}${spanStart} id="${i}"> ${v}${spanEnd}`;
      }
    });
    return spannedHtml;
  }

  function getHtmlOfPara(paraHtml) {
    let html = '';
    const words = paraHtml.split(' ');
    words.forEach((v, i) => {
      if (html === '') html = v;
      else html += ` ${v}`;
    });
    return html;
  }

  function getRemainingPara(paraHtml, startIndex) {
    let html = '';
    const words = paraHtml.split(' ');
    words.forEach((v, i) => {
      if (i >= startIndex) {
        if (html === '') html = v;
        else html += ` ${v}`;
      } else return false;
    });
    return html;
  }

  function getSelectedPara(paraHtml, endIndex) {
    let html = '';
    const words = paraHtml.split(' ');
    words.forEach((v, i) => {
      if (i <= endIndex) {
        if (html === '') html = v;
        else html += ` ${v}`;
      } else return false;
    })
    return html;
  }
};

pagify();
module.exports.pagify = pagify;