// ==UserScript==
// @name         false positive reports page mod
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  .
// @author       Dan Tripp (dtr@siteimprove.com), Jeremy Gonzales (jgo@siteimprove.com) 
// @match        *://*/*DecisionSupport*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==

// these are for fetching the google sheet which contains the notes per account: 
// @grant        GM.xmlHttpRequest
// @connect      docs.google.com
// @connect      googleusercontent.com

// these are for storing the target date: 
// @grant        GM_setValue
// @grant        GM_getValue

// @run-at       document-idle
// ==/UserScript==
var tamperMonkeyScriptVars_d09e64b3_e662_459f_a079_a070b7805508;
(async function (scriptVars) {

    let g_targetDate = null;
    let g_filterRuleIdNum = null;


	const g_accountNotesGoogleSheetsId = '1h9h3y1FDPgLC2ndVDkXLl8Qk61Ldh-Jg8GPucJRyK1I';
	const g_accountNotesGoogleSheetsUrlForCsvDownload = `https://docs.google.com/spreadsheets/d/${g_accountNotesGoogleSheetsId}/export?format=csv`;
	const g_accountNotesGoogleSheetsUrlForEditing = `https://docs.google.com/spreadsheets/d/${g_accountNotesGoogleSheetsId}/edit?gid=0#gid=0`;

	/*
	Good test account (many fprs): https://my2.siteimprove.com/Auth/Direct?personId=47207321&accountId=6247&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3FsiteId%3D831137%26lang%3Den-US
	*/
	
	async function miscInit() {
		if(scriptVars.listenerInfo === undefined) {
			scriptVars.listenerInfo = [];
		}

		if(scriptVars.observer) {
			scriptVars.observer.disconnect();
			scriptVars.observer = undefined;
		}
	}

	function getAccountNotesLoadingStatusElem() {
		let r = scriptVars.parentElemForMenu.firstElementChild.shadowRoot
			.getElementById('account-notes-loading-status');
		return r;
	}

	function getOurPageIsLoadingIndicatorElem() {
		let r = scriptVars.parentElemForMenu.firstElementChild.shadowRoot
			.getElementById('page-is-loading-indicator');
		return r;
	}

    async function showNotesForAccount() {
        let stringToShow = '';
		let statusElem = getAccountNotesLoadingStatusElem();
		addMouseHoverTooltipForAccountNotesStatus(statusElem);
		statusElem.className = 'status-loading';
        try {
            let response = await GM.xmlHttpRequest({url: g_accountNotesGoogleSheetsUrlForCsvDownload});
            if(response.status !== 200) {
				statusElem.className = 'status-error';
                console.error('Bad response while getting notes.', response);
                stringToShow = 'Bad response while getting notes.  ' + response.statusText;
            } else {
                let csvContents = response.responseText;
                stringToShow = getNotesForAccountFromCsvContents(csvContents, getAccountId());
				statusElem.className = 'status-success';
            }
        } catch (error) {
			statusElem.className = 'status-error';
            console.error('Error while getting notes.', error);
            stringToShow = 'Error while getting notes.  ' + error;
        }

        if(stringToShow) {
            showMsgAsModal(stringToShow);
        }
    }

    function showMsgAsModal(stringToShow_) {
        let stringToShow = escapeForInlineHtml(stringToShow_).replace(/\n/g, '<br>');
        let modalShadowHost = document.createElement('div');
        modalShadowHost.attachShadow({mode: 'open'}).innerHTML = 
            `<dialog style="width: 50vw; margin: auto; position: fixed; 
                    top: 50%; left: 50%; transform: translate(-50%, -50%); 
                    border: 3px solid #888; box-shadow: 2px 2px 10px #888888; 
                    display: flex; flex-direction: column; justify-content: center; 
                    overflow: auto;">
                <form method="dialog" style="display: flex; flex-direction: column; 
                        align-items: center; margin: 0;">
                    <p style="align-self: flex-start; margin: 10px 0;">${stringToShow}</p>
                    <button style="text-align: center; margin-top: auto;">Close</button>
                </form>                
            </dialog>`;
        document.body.appendChild(modalShadowHost);
        let modal = modalShadowHost.shadowRoot.querySelector(`dialog`);
        let closeButton = modalShadowHost.shadowRoot.querySelector('button');
        closeButton.addEventListener('click', () => {modalShadowHost.remove();});
        modal.showModal();
    }

    function getNotesForAccountFromCsvContents(csvContents_, accountId_) {
        let r;
        let csvRows = parseCsv(csvContents_);
        for(let csvRow of csvRows) {
            let accountId = csvRow[0];
            if(accountId === accountId_) {
                if(r) {
                    throw new Error(`multiple notes found for this account (${accountId_})`);
                }
                let dansNotes = csvRow[1], jeremysNotes = csvRow[2];
                if(dansNotes || jeremysNotes) {
                    r = `Dan's notes:\n\n${dansNotes || '(none)'}\n\n`+
                        `Jeremy's notes:\n\n${jeremysNotes || '(none)'}`;
                }
            }
        }
        return r;
    }

    function parseCsv(csvContents_) {
        let rRows = scriptVars.papaParse.parse(csvContents_).data;
        if(rRows.length === 0 || rRows[0][0] !== 'Account ID') {
            throw new Error('error parsing CSV spreadsheet (header row not found)');
        }
        for(let row of rRows) {
            row.splice(0, row.length, ...row.map(x => x.replace(/\\n/g, '\n'))); // replace \n with a real newline 
        }
        return rRows;
    }
	
	function hideThePagesOriginalBulkActionsButtons() {
		let styleElem = document.createElement('style');
		styleElem.innerText = `.bulk-actions_bulk-bar_wGCpL { display: none; }`;
		document.head.appendChild(styleElem);
	}

	/* This function will call your arg function, but not to often.  It enforces a minimum 
	time between calls.
    "Time between calls" means the time between the end of call 1 and the 
    start of call 2.  (Not between the start of call 1 and the start of call 2.)  So if your arg function is slow, then this function will call it less often.  That's why that arg is called "min inter-call delay" and not "max call period".  
	This function has an arg "no call pending delay" which introduces a delay when the function 
	is called either a) for the first time, or b) for the first time in a long time.  
	This is useful because this function will be called from a certain mutation observer which 
	I noticed tends to create 2 events within ~ 100 milliseconds of each other.  
	If we didn't implement this "no call pending delay" then those 2 events would cause 
	one call to the arg function immediately, and a second call "min inter-call delay" later.  
	That's not ideal, especially because with that particular mutation observer, at the time 
	of writing, the mutations that I notice the most are only present in the second event.  
	So I was waiting "min inter-call delay" to see my arg function deal with them.  
	With this "no call pending delay", is causes one call, and sooner.  This results in a 
	GUI that is more responsive. */
	function callThrottledFuncMaybe(func_, minInterCallDelayMillis_, noCallPendingDelayMillis_) {
		assert(minInterCallDelayMillis_ > noCallPendingDelayMillis_);
		if(scriptVars.throttledFuncToInfo === undefined) {
			scriptVars.throttledFuncToInfo = new Map();
		}
		function callFunc() {
			try {
				func_();
			} finally {
				scriptVars.throttledFuncToInfo.set(func_, 
					{lastCallEndTime: performance.now(), isCallPending: false});
			}
		}
		function callFuncInFuture(timeToWaitMillis_) {
			scriptVars.throttledFuncToInfo.set(func_, 
				{lastCallEndTime: undefined, isCallPending: true});
			setTimeout(callFunc, timeToWaitMillis_);
		}
		let info = scriptVars.throttledFuncToInfo.get(func_);
		if(info === undefined) {
			callFuncInFuture(noCallPendingDelayMillis_);
		} else {
			if(!info.isCallPending) {
				let timeSinceLastCallEndTime = performance.now() - info.lastCallEndTime;
				if(timeSinceLastCallEndTime >= minInterCallDelayMillis_) {
					callFuncInFuture(noCallPendingDelayMillis_);
				} else {
					let timeToWait = minInterCallDelayMillis_ - timeSinceLastCallEndTime;
					callFuncInFuture(timeToWait);
				}
			}
		}
	}

	function removeStyleAttribsAddedByUs() {
		document.querySelectorAll('*[data-fprs-page-mod-bookmarklet-added-style-attrib-to-elem]')
			.forEach((e) => { e.removeAttribute('style'); });
	}
	
	function markElemAsHavingStyleAttribAddedByUs(elem_) {
		elem_.setAttribute('data-fprs-page-mod-bookmarklet-added-style-attrib-to-elem', '');
	}
	// Jeremy is testing Commit
	let COLORS = [
        "#0000FF",
		"#009900",
		"#00DDDD",
		"#AA0000",
		"#FF00FF",
		"#BBBBBB",
		"#777777",
		"#9999FF",
		"#55FFFF",
		"#FF5555",
		"#FF55FF",
		"#FFFF55",
	];

	function getTbodyOfTable() {
		let tbodyOfTableAll = document.querySelectorAll('[role="tabpanel"] table tbody');
		/* ^^ handles all 3 tabs: "needs review", "approved", and "rejected". */
		if(tbodyOfTableAll.length !== 1) return undefined;
		let r = tbodyOfTableAll[0];
		return r;
	}

	function getAccountId() {
		let r = document.querySelector('html head meta[name="accountId"]').getAttribute('value');
		return r;
	}

	function getQaSiteIdFromPageReportUrl(pageReportUrl_) {
		let r = pageReportUrl_.match(/\/Inspector\/(\d+)\//)[1];
		return r;
	}

	function getAppropriateSupportToolHostnameForPageReportUrl(pageReportUrl_) {
		let platformHostname = (new URL(pageReportUrl_)).hostname;
		let isUsNotEuDatacenter = {'my2.us.siteimprove.com': true, 'my2.siteimprove.com': false}
			[platformHostname];
		let r = isUsNotEuDatacenter 
			? 'ussupporttool.siteimprove.com' : 'supporttool.siteimprove.com';
		return r;
	}

	function getSupportToolSiteConfigUrlFromPageReportUrl(accountId_, qaSiteId_, supportToolHostname_) {
		let r = `https://${supportToolHostname_}/QA/Configuration.aspx?accountid=${accountId_}`+
			`&qasiteid=${qaSiteId_}`;
		return r;
	}

	function getSupportToolSiteParamsUrlFromPageReportUrl(accountId_, qaSiteId_, supportToolHostname_) {
		let r = `https://${supportToolHostname_}/QA/Siteparams.aspx?accountid=${accountId_}`+
			`&qasiteid=${qaSiteId_}`;
		return r;
	}

	function getSupportToolSiteCrawlHistoryUrlFromPageReportUrl(accountId_, qaSiteId_, supportToolHostname_) {
		let r = `https://${supportToolHostname_}/QA/Crawl/History/Default.aspx?accountid=`+
			`${accountId_}&qasiteid=${qaSiteId_}`;
		return r;
	}

	function getSupportToolChangeSitePageFilteredUrl(accountId_, qaSiteId_, supportToolHostname_) {
		let r = `https://${supportToolHostname_}/Pickers/SitePicker.aspx?ref=%2fQA%2fConfiguration.aspx%3f`+
			`accountid%3d${accountId_}&pagesize=200&searchterm=${qaSiteId_}&searchmetod=equalto&`+
			`searchmode=include&searchin=all`;
		return r;
	}

	function createLinkElem(url_, visibleText_) {
		let r = document.createElement('a');
		r.setAttribute('href', url_);
		r.setAttribute('target', '_blank');
		r.setAttribute('style', 'font-size: 1.5em');
		r.textContent = visibleText_;
		return r;
	}

	function ancestor(node_, level_) {
		let r = node_;
		for(let i=0; i<level_; i++) {
			r = r.parentNode;
		}
		return r;
	}

	function addSiteColumnSupportToolLinks() {
		let tbodyOfTable = getTbodyOfTable();
		let siteColRootSpanElems = tbodyOfTable.querySelectorAll(
			'tr > td:nth-of-type(3) > div > div > span');
		for(let siteColRootSpanElem of siteColRootSpanElems) {
			let siteColRootSpanElemFirstSpanChild = siteColRootSpanElem.querySelector('span:nth-of-type(1)');
			let trElem = ancestor(siteColRootSpanElemFirstSpanChild, 5);
			assert(trElem.tagName === "TR");
			let pageReportAnchorElem = trElem.querySelector(
				'th:nth-of-type(1) > div > div > a');
			if(!pageReportAnchorElem) {
				/* This will happen if "affected pages" == 0.  i.e. there will be no page report URL.  
				We use the page report URL to get the site ID, and then to create the supporttool 
				link.  */
				continue;
			}
			let pageReportUrl = pageReportAnchorElem.href;

			function hidePopupMenu() {
				popupMenuDiv.style.display = 'none';
			}

			let popupClickTargetElem = ancestor(siteColRootSpanElem, 3);
			assert(popupClickTargetElem.tagName === "TD");
			/* ^^ making this td elem the click target instead of the div is so that we can 
			handle it when this cell has no inner text i.e. it's visually empty.  that happens when the 
			site has been deleted and/or soft-deleted.  IDK the difference. */
			popupClickTargetElem.setAttribute('style', 
				'background-color: #f0f0f0; cursor: pointer; border-radius: 12px;');
			markElemAsHavingStyleAttribAddedByUs(popupClickTargetElem);

			let popupMenuDiv = document.createElement('div');
			markElemAsAddedByUs(popupMenuDiv);
			popupMenuDiv.setAttribute('style', 
				'position: fixed; border: 1px solid black; background-color: white; z-index: 1;');
			hidePopupMenu();

			let accountId = getAccountId();
			let qaSiteId = getQaSiteIdFromPageReportUrl(pageReportUrl);
			let supportToolHostname = getAppropriateSupportToolHostnameForPageReportUrl(pageReportUrl);

			let link1Elem = createLinkElem(
				getSupportToolSiteConfigUrlFromPageReportUrl(accountId, qaSiteId, supportToolHostname), 
				'Support tool - site config (JS / non-JS, proxy)');
			popupMenuDiv.appendChild(link1Elem);

			popupMenuDiv.appendChild(document.createElement('br'));
			
			let link2Elem = createLinkElem(
				getSupportToolSiteParamsUrlFromPageReportUrl(accountId, qaSiteId, supportToolHostname), 
				'Support tool - site params (credentials)');
			popupMenuDiv.appendChild(link2Elem);

			popupMenuDiv.appendChild(document.createElement('br'));
			
			let link3Elem = createLinkElem(
				getSupportToolSiteCrawlHistoryUrlFromPageReportUrl(accountId, qaSiteId, supportToolHostname), 
				'Support tool - site crawl history');
			popupMenuDiv.appendChild(link3Elem);
			popupMenuDiv.appendChild(document.createElement('br'));
			
			let link4Elem = createLinkElem(
				getSupportToolChangeSitePageFilteredUrl(accountId, qaSiteId, supportToolHostname), 
				'Support tool - site pending deletion?');
			popupMenuDiv.appendChild(link4Elem);

			popupClickTargetElem.parentElement.appendChild(popupMenuDiv);

			let listener = function(event) {
				event.stopPropagation();
				popupMenuDiv.style.left = `${event.clientX}px`;
				popupMenuDiv.style.top = `${event.clientY}px`;
				popupMenuDiv.style.display = 'block';
			};
			addEventListener(true, popupClickTargetElem, 'click', listener);
			for(let e of [link1Elem, link2Elem, link3Elem, link4Elem]) {
				addEventListener(true, e, "click", hidePopupMenu);
			}

		}
	}

	/* @param lastArg_ I don't know whether this is used as "options" or "useCapture". */
	function addEventListener(rememberForRemoval_, target_, eventType_, listener_, lastArg_) {
		target_.addEventListener(eventType_, listener_, lastArg_);
		if(rememberForRemoval_) {
			scriptVars.listenerInfo.push({target: target_, eventType: eventType_, 
				listener: listener_, lastArg: lastArg_});
		}
	}

	function removeElementsAddedByUs() {
		document.querySelectorAll('[data-fprs-page-mod-bookmarklet-added-new-elem]')
			.forEach((e) => { e.parentNode.removeChild(e); });
	}

	function getAllCustomerPageUrlSpanElems() {
		let r = getTbodyOfTable().querySelectorAll('th:nth-of-type(1) > div > div > span');
		r = [...r];
		return r;
	}

	function getAllRuleLinkElems() {
		let r = getTbodyOfTable().querySelectorAll('td:nth-of-type(2) a');
		r = [...r];
		return r;
	}

	function markElemAsAddedByUs(elem_) {
		elem_.setAttribute('data-fprs-page-mod-bookmarklet-added-new-elem', '');
	}

    function escapeForInlineHtml(str_) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str_));
        let r = div.innerHTML;
        return r;
    }

	function getAllVisibleCheckboxes() {
		return getAllCheckboxes().filter((checkbox) => {
			let trElem = checkbox.closest('tr');
			return isRowVisibleAccordingToOurRuleFilter(trElem);
		});
	}

	function addDoubleClickListenersToCheckboxes() {
		let n = 5, nextNCheckboxes = [];
		for(let checkbox of getAllVisibleCheckboxes().reverse()) {
			while(nextNCheckboxes.length >= n) {
				nextNCheckboxes.pop();
			}
			nextNCheckboxes.unshift(checkbox);
			let nextNCheckboxesCopyForListenerForCurCheckbox = nextNCheckboxes.slice();
			function listenerForCurCheckbox(event__) {
				for(let nextCheckbox of nextNCheckboxesCopyForListenerForCurCheckbox) {
					nextCheckbox.click();
				}
			}
			addEventListener(true, checkbox, 'dblclick', listenerForCurCheckbox);
		}
	}

	function getAllCheckboxes() {
		let r = getTbodyOfTable().querySelectorAll('tr > td:nth-of-type(1) input[type="checkbox"]');
		r = [...r];
		return r;
	}

	function makeCheckboxesLarge() {
		for(let checkbox of getAllVisibleCheckboxes()) {
			let checkboxesAncestorToFill = checkbox.parentElement.parentElement;
			checkboxesAncestorToFill.style.position = 'relative';
			checkboxesAncestorToFill.setAttribute(
				'data-fprs-page-mod-bookmarklet-added-style-attrib-to-elem', '');
			checkbox.setAttribute("style", 
				"width: 100%; height: 100%; margin: 0; position: absolute; top: 0; left: 0;");
			checkbox.setAttribute(
				'data-fprs-page-mod-bookmarklet-added-style-attrib-to-elem', '');
		}
	}

    function getRuleIdNumFromUrl(href_) {
        let url = new URL(href_);
        let params = new URLSearchParams(url.search);
        let r = params.get("ruleId");
        return r;
    }

    function addReviewerForRuleColorCoding() {
        for(let ruleLinkElem of getAllRuleLinkElems()) {
            let ruleIdNum = getRuleIdNumFromUrl(ruleLinkElem.href);
            let jeremysRuleIdNums = new Set(["3", "83", "53", "87"]);
            let color = jeremysRuleIdNums.has(ruleIdNum) ? "lightgreen" : "rgb(255,200,0)";
            ruleLinkElem.style.backgroundColor = color;
            markElemAsHavingStyleAttribAddedByUs(ruleLinkElem);
            let opensInNewWindowIconElem = ruleLinkElem.querySelector('span:last-of-type');
            opensInNewWindowIconElem.style.display = 'none';
            markElemAsHavingStyleAttribAddedByUs(opensInNewWindowIconElem);
        }
    }

    function addRuleFilterButtons() {
		if(g_filterRuleIdNum) return;
        const ruleIdNumToNumOccurrences = new Map();
        for(let ruleLinkElem of getAllRuleLinkElems()) {
            let ruleIdNum = getRuleIdNumFromUrl(ruleLinkElem.href);
            if (ruleIdNumToNumOccurrences.has(ruleIdNum)) {
                ruleIdNumToNumOccurrences.set(ruleIdNum, 
                    ruleIdNumToNumOccurrences.get(ruleIdNum) + 1);
            } else {
                ruleIdNumToNumOccurrences.set(ruleIdNum, 1);
            }
        }

        let ruleLinkElems = getAllRuleLinkElems();
		for(let ruleLinkElem of ruleLinkElems) {
            let ruleIdNum = getRuleIdNumFromUrl(ruleLinkElem.href);
            let numOccurrencesOfRule = ruleIdNumToNumOccurrences.get(ruleIdNum);
            let ruleFilterButton = document.createElement('button');
            ruleFilterButton.setAttribute('title', `Filter by this rule.  There are `+
				`${numOccurrencesOfRule}/${ruleLinkElems.length} row(s) for this rule on `+
				`this page of false positive reports.`);
            ruleFilterButton.setAttribute('aria-label', 
                `filter by this rule ${numOccurrencesOfRule}/${ruleLinkElems.length}`);
            ruleFilterButton.textContent = `${numOccurrencesOfRule}/${ruleLinkElems.length}`;
            markElemAsAddedByUs(ruleFilterButton);
            ruleLinkElem.insertAdjacentElement('afterend', ruleFilterButton);
            ruleFilterButton.addEventListener('click', () => {filterByRule(ruleIdNum);});
        }
    }

    function hideTableRowsAccordingToRuleFilter() {
        let originalSelectAllButton = getTbodyOfTable().parentNode.querySelector('thead tr input');
        setDisplayNone(originalSelectAllButton);
        if(!g_filterRuleIdNum) return;
        for(let ruleLinkElem of getAllRuleLinkElems()) {
            let ruleIdNum = getRuleIdNumFromUrl(ruleLinkElem.href);
            if(ruleIdNum !== g_filterRuleIdNum) {
                let trElem = ancestor(ruleLinkElem, 4);
                assert(trElem.tagName === "TR");
				let checkbox = getCheckboxFromTrElem(trElem);
				if(checkbox.checked) checkbox.click();
                setDisplayNone(trElem);
            }
        }
    }

    function setDisplayNone(elem_) {
        elem_.style.display = 'none';
        markElemAsHavingStyleAttribAddedByUs(elem_);  
    }

    function filterByRule(ruleIdNum_) {
        g_filterRuleIdNum = ruleIdNum_;
        refresh();
    }

    /* The line in this function which gets innerText sometimes causes error messages like this 
	to be reported in the console: 
	userscript.html?name=bookmarklet-dev%252C-auto-load-scratch-local-file.user.js&id=a3c6bae5-a4c1-4509-8da9-dffb94adfa98:475 [Report Only] Refused to load the image 'data:image/svg+xml,%3C%3Fxml version%3D%221.0%22 encoding%3D%22utf-8%22%3F%3E%0D%3C!-- Generator%3A Adobe Illustrator 22.1.0%2C SVG Export Plug-In . SVG Version%3A 6.00 Build 0)  --%3E%0D%3Csvg version%3D%221.1%22 xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22 x%3D%220px%22 y%3D%220px%22%0D%09 viewBox%3D%220 0 48 48%22 style%3D%22enable-background%3Anew 0 0 48 48%3B%22 xml%3Aspace%3D%22preserve%22%3E%0D%3Cstyle type%3D%22text%2Fcss%22%3E%0D%09.st0%7Bfill%3A%23FFFFFF%3B%7D%0D%3C%2Fstyle%3E%0D%3Cg%3E%0D%09%3Crect y%3D%2220%22 class%3D%22st0%22 width%3D%2248%22 height%3D%228%22%2F%3E%0D%3C%2Fg%3E%0D%3C%2Fsvg%3E%0D' because it violates the following Content Security Policy directive: "img-src 'self' https://*.siteimprove.com https://*.siteimprove.net https://app.pendo.io https://sdr.totango.com https://*.siteimproveanalytics.io https://*.googleapis.com".
	Other functions of ours which get innerText cause similar errors. 
	Similar errors appear when I'm using the false positive reports page and I'm /not/ using 
	this tampermonkey script.  I don't know what these errors mean.  I think they're harmless.  
	Especially because they say "Report Only". */
	function addLinksToCustomerPages() {
        for(let customerPageUrlSpanElem of getAllCustomerPageUrlSpanElems()) {
            let customerPageUrl = customerPageUrlSpanElem.innerText;
            let thElem = customerPageUrlSpanElem.closest(`th`);
            let computedBackgroundColor = window.getComputedStyle(thElem).backgroundColor;
            customerPageUrlSpanElem.setAttribute('style', 
                `color:${computedBackgroundColor};position: relative; text-decoration: underline;filter: invert(1) grayscale(1) brightness(1.3) contrast(9000); mix-blend-mode: luminosity; opacity: 0.95;`);
            markElemAsHavingStyleAttribAddedByUs(customerPageUrlSpanElem);
            let aElem = document.createElement('a');
            aElem.href = customerPageUrl;
            aElem.setAttribute('style', `position: absolute; left: 0; top: 0; right: 0; bottom: 0;`);
            markElemAsAddedByUs(aElem);
            customerPageUrlSpanElem.appendChild(aElem);
        }
    }

	function isRowVisibleAccordingToOurRuleFilter(trElem_) {
		assert(trElem_.tagName === "TR");
		if(!g_filterRuleIdNum) return true;
		let ruleLinkElem = getRuleLinkElemFromTrElem(trElem_);
		let ruleIdNum = getRuleIdNumFromUrl(ruleLinkElem.href);
		let r = ruleIdNum === g_filterRuleIdNum;
		return r;
	}

	function addCustomerPageUrlColorCoding() {
		let customerPageUrlToColor = {};
		let customerPageUrlsThatHaveBrokenRuns = new Set();
		let allCustomerPageUrlSpanElems = getAllCustomerPageUrlSpanElems();
		let prevCustomerPageUrl = null;
		for(let customerPageUrlSpanElem of allCustomerPageUrlSpanElems) {
			let trElem = customerPageUrlSpanElem.closest('tr');
			if(!isRowVisibleAccordingToOurRuleFilter(trElem)) continue;
			let customerPageUrl = customerPageUrlSpanElem.innerText;

			if(prevCustomerPageUrl !== null && customerPageUrl !== prevCustomerPageUrl 
					&& customerPageUrl in customerPageUrlToColor) {
				customerPageUrlsThatHaveBrokenRuns.add(customerPageUrl);
			}
			prevCustomerPageUrl = customerPageUrl;

			if(!(customerPageUrl in customerPageUrlToColor)) {
				let nextColor = COLORS[Object.keys(customerPageUrlToColor).length % COLORS.length];
				customerPageUrlToColor[customerPageUrl] = nextColor;
			}
		}
		for(let customerPageUrlSpanElem of allCustomerPageUrlSpanElems) {
			let customerPageUrl = customerPageUrlSpanElem.innerText;
			let color = customerPageUrlToColor[customerPageUrl];
			let elemToAddBackgroundColorTo = ancestor(customerPageUrlSpanElem, 3);
			if(customerPageUrlsThatHaveBrokenRuns.has(customerPageUrl)) {
				elemToAddBackgroundColorTo.style.background = 
					`repeating-linear-gradient(45deg, transparent, transparent 10px, ${color} 10px, ${color} 20px)`;
			} else {
				elemToAddBackgroundColorTo.style.backgroundColor = color;
			}
            let aElem = elemToAddBackgroundColorTo.querySelector('a');
            if(aElem) {
                aElem.setAttribute('style', 
                    `color: ${color}; font-weight: bold; text-decoration: underline; filter: invert(1) grayscale(1) brightness(1.3) contrast(9000); mix-blend-mode: luminosity; opacity: 0.95;`);
                markElemAsHavingStyleAttribAddedByUs(aElem);
            }
            markElemAsHavingStyleAttribAddedByUs(elemToAddBackgroundColorTo);
		}
	}

	function assert(bool_) {
		if(!bool_) throw new Error('assertion failed');
	}

	/* This might not be necessary any more.  I think that the platform implemented a more
	obvious focus indicator in late 2023.  vague memory. */ 
	function addVeryObviousFocusIndicator() {
		const __focusStyleClassName = "fprsInjectedFocusIndicator";
		const getFocusSelector = (mode) => {
			const selector = ".".concat(__focusStyleClassName, ":focus");
			const outlineColor = "".concat(mode === "light" ? "#ffffff" : mode === "dark" ? "#000000" : "revert", " !important;");
			const body = "outline-style: solid !important; outline-width: 3px !important; ".concat("outline-color: ", outlineColor);
			return "".concat(selector, "{", body, "}");
		};
		const addFocusStyle = (element) => {
			element.classList.add(__focusStyleClassName);
		};
		const ourEventListenerToAddFocusStyle = (event) => {
			addFocusStyle(event.target);
		};
		const addFocusStyleAndListener = ({colorMode}) => {
			let focusStyle = document.createElement("style");
			focusStyle.setAttribute("type", "text/css");
			focusStyle.innerHTML = getFocusSelector(colorMode);
			document.querySelector("head").appendChild(focusStyle);
			addFocusStyle(document.activeElement);
			addEventListener(true, document.body, "focus", ourEventListenerToAddFocusStyle, true);
			
		};
		addFocusStyleAndListener({colorMode: "auto"});
	}

	function getAllDateColumnTdElems() {
		let r = getTbodyOfTable().querySelectorAll('tr > td:nth-of-type(5)');
		return r;
	}

	function addDateColumnColorCoding() {
		if(!g_targetDate) return;
		let locale = document.documentElement.getAttribute('data-locale');
		if(!locale) throw new Error();
		let isThereMoreThanOnePageOfFprs = !!document.querySelector('div[data-component="pagination"] button[aria-label="Next"]');
		let localeToDateFormat = {
			'da-DK': 'dd-MM-yyyy', /* eg. 05-09-2023 https://my2.siteimprove.com/Auth/Direct?personId=126687093&accountId=50&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Dda-DK */
			'de-AT': 'dd.MM.yy', /* eg. 12.09.23, 04.10.23  https://my2.siteimprove.com/Auth/Direct?personId=552509745&accountId=6033142&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */ 
			'de-CH': 'dd.MM.yy', /* eg. 28.09.23, 02.12.22  https://my2.siteimprove.com/Auth/Direct?personId=583082225&accountId=6036438&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */
			'de-DE': 'dd.MM.yy', /* eg. 27.09.22 or 08.12.22 https://my2.siteimprove.com/Auth/Direct?personId=149994145&accountId=24542&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Dde-DE */
			'en-AI': 'dd/MM/yyyy', /* eg. 02/02/2024 - https://my2.siteimprove.com/Auth/Direct?personId=167636460&accountId=80579&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-GB */
			'en-AU': 'd/M/yy', /* eg. 31/8/23, 8/8/22 - https://my2.siteimprove.com/Auth/Direct?personId=175342849&accountId=82990&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-GB  */
			'en-CA': 'yyyy-MM-dd', 
			'en-GB': 'dd/MM/yyyy', /* eg. "08/09/2023" -  https://my2.siteimprove.com/Auth/Direct?personId=47212020&accountId=8803&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-GB*/
			'en-IE': 'dd/MM/yyyy', /* eg. 05/07/2022 or 22/06/2022 https://my2.siteimprove.com/Auth/Direct?accountId=5009233&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport */
			'en-NZ': 'd/MM/yy', /* d or dd is unclear.  eg. 21/09/23 https://my2.siteimprove.com/Auth/Direct?personId=1057622587&accountId=6280755&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-GB */
			'en-US': 'M/d/yy', /* eg. 9/7/23, 9/21/23 - https://my2.us.siteimprove.com/Auth/Direct?personId=984774533&accountId=6290449&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US  */
			'en-DK': 'dd/MM/yyyy', /* eg. 16/08/2024  https://my2.siteimprove.com/Auth/Direct?personId=268559035&accountId=6012388&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-GB */
			'es-ES': 'd/M/yy', /* eg. 1/9/23 https://my2.siteimprove.com/Auth/Direct?personId=735683955&accountId=6097427&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */
			'es-US': 'd/M/yyyy', /* eg. 7/11/2023, 13/7/2023  https://my2.siteimprove.com/Auth/Direct?personId=818062525&accountId=6253864&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */
			'fi-FI': 'd.M.yyyy', /* eg. 13.9.2023 - https://my2.siteimprove.com/Auth/Direct?personId=681201032&accountId=6049239&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-GB */
			'fr-FR': 'dd/MM/yyyy', /* d or dd unclear.  eg. 24/01/2023 - https://my2.siteimprove.com/Auth/Direct?personId=722784198&accountId=6064285&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */
			'it-IT': 'dd/MM/yy', /* eg. "31/08/23" - https://my2.siteimprove.com/Auth/Direct?personId=741857441&accountId=6114173&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */
			'ja-JP': 'yyyy/MM/dd' , /* eg. 2023/08/03  https://my2.siteimprove.com/Auth/Direct?personId=1374993545&accountId=6287304&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */
			'kw-GB': 'yyyy-MM-dd', /* eg. 2024-01-25  https://my2.siteimprove.com/Auth/Direct?personId=47208789&accountId=7114&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-GB */
			'nb-NO': 'dd.MM.yyyy', /* eg. 09.02.2023, 23.08.2023  https://my2.siteimprove.com/Auth/Direct?personId=746257710&accountId=6122885&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-GB */
			'nl-BE': 'd/MM/yyyy', /* eg. 3/10/2023, 25/09/2023 https://my2.siteimprove.com/Auth/Direct?personId=744795036&accountId=6120827&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */ 
			'nl-NL':  'dd-MM-yyyy', /* eg. "04-09-2023" - https://my2.siteimprove.com/Auth/Direct?personId=257718760&accountId=6005070&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */
			'sv-SE': 'yyyy-MM-dd', /* eg. 2023-09-14 - https://my2.siteimprove.com/Auth/Direct?personId=47210236&accountId=7845&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */
			'is-IS': 'd.M.yyyy', /* eg. 22.9.2022 1.11.2022  - https://my2.siteimprove.com/Auth/Direct?personId=386268974&accountId=6020043&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport%3Flang%3Den-US */
		};
		let dateFormat = localeToDateFormat[locale];
		if(!dateFormat) throw new Error(`local "${locale}" not found.`);
		let jodaTime = scriptVars.jodaTime;
		let dateFormatter = jodaTime.DateTimeFormatter.ofPattern(dateFormat);
		let targetDate = jodaTime.LocalDate.of(g_targetDate.year, g_targetDate.month, g_targetDate.day);
		let ignorableBacklogCutoffDate = jodaTime.LocalDate.of(2022, 12, 31);
		for(let dateColTdElem of getAllDateColumnTdElems()) {
			let curRowDateStr = dateColTdElem.innerText;
			let curRowDate = jodaTime.LocalDate.parse(curRowDateStr, dateFormatter);
			let color;
			if(curRowDate.isAfter(targetDate)) {
				color = '#00f';
			} else if(curRowDate.isEqual(targetDate) || curRowDate.isAfter(ignorableBacklogCutoffDate)) {
				color = '#faa';
			} else {
				color = '#ccc';
			}
			if(isThereMoreThanOnePageOfFprs) {
				dateColTdElem.style.background = 
					`repeating-linear-gradient(45deg, transparent, transparent 10px, ${color} 10px, ${color} 20px)`;
			} else {
				dateColTdElem.style.backgroundColor = color;
			}
			dateColTdElem.setAttribute('data-fprs-page-mod-bookmarklet-added-style-attrib-to-elem', '');
		}
	}

	function hideBottomBarProfilerResults() {
		document.querySelectorAll('.profiler-results').forEach((e) => { 
			e.setAttribute('style', 'display: none');
			e.setAttribute('data-fprs-page-mod-bookmarklet-added-style-attrib-to-elem', '');
		});
	}

	function hideHelpCenterButton() {
		getXPathElements('/html/body/button').forEach((e) => {
			e.setAttribute('style', e.getAttribute('style') + '; visibility: hidden');
		}); 
	}

	/* pendo popups have included messages about: 
	- AI remeditate (jan 2024) 
	- product feedback via pendo (late 2023) */
	function hidePendoPopup() {
		document.querySelector('#pendo-base')?.remove();
	}

    /* I first noticed it in late july 2024. */
    function hideCookiesConsentButton() {
        document.querySelector('#CookiebotWidget')?.remove();
    }

	function getXPathElements(xpathExpression_) {
		let result = [];
		let xpathResult = document.evaluate(xpathExpression_, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
		let node = xpathResult.iterateNext();
		while (node) {
			result.push(node);
			node = xpathResult.iterateNext();
		}
		return result;
	}

	function isTheMainTablePresent() {
		return !!getTbodyOfTable();
	}

	function removeListenersAddedByUs() {
		for(let e of scriptVars.listenerInfo) {
			e.target.removeEventListener(e.eventType, e.listener, e.lastArg);
		}
		scriptVars.listenerInfo = [];
	}

	function refresh() {
		if(!isTheMainTablePresent()) return;

		stopObserving();

		removeStyleAttribsAddedByUs();
		removeElementsAddedByUs();
		/* We don't make any attempt to undo hideHelpCenterButton(), and a few other things. */
		removeListenersAddedByUs();

		addDateColumnColorCoding();
		addCustomerPageUrlColorCoding();
        addLinksToCustomerPages();
        addReviewerForRuleColorCoding();
        addRuleFilterButtons();
        hideTableRowsAccordingToRuleFilter();
		addSiteColumnSupportToolLinks();
		addVeryObviousFocusIndicator();
		makeCheckboxesLarge();
		addDoubleClickListenersToCheckboxes();
		addKeyListeners();
	    hideBottomBarProfilerResults();
		hideHelpCenterButton();
		hidePendoPopup();
        hideCookiesConsentButton();

		startObserving();
	}

    /* This deals with an arguable bug in the platform: 
    When I select many rules in the standard filter, the filter 
    clear button contains the names of those many rules, which amounts to a long string.  
    So the button becomes wider than my screen width.  It causes a horizontal scroll bar 
    to appear and make the page hard to use.  So here we replace that long content with "...". 
	We do it one time via a <style> element (instead of on every refresh, with code) because 
	these elements seem to be recreated every time I click a checkbox.  So back when we did 
	this on every refresh, there would be a "flash of unmodified content".  This flash 
	was particularly annoying because it would cause the very long string to reappear during 
	that flash and hence horizontal scrollbars would appear. */
    function truncateActiveFilterButtons() {
		let styleElem = document.createElement('style');
		styleElem.innerText = `
			[data-component="active-filters"] > button > span + p { display: none; }
			[data-component="active-filters"] > button > span:has(+ p)::after { content: '...';}`;
		document.head.appendChild(styleElem);
	}

	function stopObserving() {
		scriptVars.observer.disconnect();
	}

    function weShouldIgnoreMutationList(mutationList_) {
        /* Here we ignore mutations on popups at the bottom of the page, and maybe more.  It's intended to ignore popups on two things: 1) the "previous page" / "next page" buttons, and 2) the "num items per page" popup.  This code fixes a bug where, before this code existed, this script would do a refresh when it was unnecessary, and consequently the vertical scroll position of the viewport would jump up a little.  it would jump up enough that it would put the "next page" button out of the viewport.  quite bad.  to work around it, I'd need to either click the "next page" button really fast, or temporarily turn off this script. 
        This bug only happened on some accounts eg. 82447 and 6289812 in aug 2024.  I don't know why. */
        let r = mutationList_.every(e => e.target?.getAttribute('data-component') === 'popover');
        return r;
    }

	function initMutationObserver() {
		function callback(mutationsList__, observer__) {
			if(mutationsList__.length == 0) return; /* it's unclear if this is necessary. */
            if(!weShouldIgnoreMutationList(mutationsList__)) {
                doOneRefreshMaybe();
            }
		};

		scriptVars.observer = new MutationObserver(callback);
		startObserving();
	}

	function startObserving() {
		scriptVars.observer.observe(getObserverTargetNode(), getObserverOptions());
	}

	function getObserverTargetNode() {
		/* We used to narrow this down so that we observed only the table, more or less. 
		But then that didn't work in tampermonkey when this code is called very soon after page load 
		- that table didn't exist yet. */
		return document;
	}

	function getObserverOptions() {
		return {
			childList: true,
			attributes: false, /* it's important that this is false b/c when it was true it caused 
				a problem.  on a page w/ 200 false positive rows if I clicked the checkbox for 
				the ~ 200th row, our callback would get called many times (tens or hundreds) 
				over 10-20 seconds sometimes.  this noticeably slowed down the browser.  
				didn't seem to happen as much when I clicked the checkbox for say the 1-10th row 
				from the top.  just the rows near the bottom. */
			subtree: true, 
			characterData: true, /* This is important for us b/c w/o it we don't get notified 
				when the user does a sort by a column.  This was a bug once.  The MDN article on 
				MutationObserver doesn't (circa 2023-10-25) mention characterData.  Odd. */
		};
	}

	function createMenu() {
		scriptVars.parentElemForMenu = document.createElement('div');
		let parent = scriptVars.parentElemForMenu;
		parent.dataset.name = 'menu';
		document.body.appendChild(parent);
		let expandedMenuRootElem = createMenuExpandedView(parent);
		initMenuListeners(expandedMenuRootElem);
	}

	function makeMenuExpandedViewStyleStr() {
		let r = `position: fixed; top: 0; 
			background: #fff; border: 0.2vw solid black ; 
			padding: 0.2vw; z-index: 9999; font-size: 1.5vw ;  `;
		let position = "top-left";
		if(position === "top-left") {
			r += `left: 0%;  `;
		} else if(position === "top-right") {
			r += `left: 100%; transform: translateX(-100%);  `;
		} else if(position === "top-center") {
			r += `left: 50%; transform: translateX(-50%);  `;
		} else {
			throw new Error();
		}
		return r;
	}

	function isCallable(obj_) {
		return typeof obj_ === 'function';
	}

	/* This isn't usable by touchscreen users or keyboard users. */
	function addMouseHoverTooltip(element_, textOrTextFunc_) {
        const tooltip = document.createElement('span');
        element_.addEventListener('mouseenter', (event) => {
            tooltip.className = 'tooltip';
            tooltip.textContent = isCallable(textOrTextFunc_) ? textOrTextFunc_() : textOrTextFunc_;
            
            let hackYOffsetToFixFlicker = 8;
			Object.assign(tooltip.style, {position: 'absolute', fontSize: '1.3vw', 
                backgroundColor: '#333', color: '#fff',
                padding: '5px', borderRadius: '3px', whiteSpace: 'nowrap',
                opacity: '1', visibility: 'visible', transition: 'opacity 0.3s',
                zIndex: '99999', transform: 'translateX(-50%)', 
				top: `${event.clientY+hackYOffsetToFixFlicker}px`, 
				left: `${event.clientX}px` 
            });

            element_.ownerDocument.body.appendChild(tooltip);
        });

        element_.addEventListener('mouseleave', () => {
			tooltip.style.opacity = '0';
			tooltip.style.visibility = 'hidden';
			tooltip.addEventListener('transitionend', () => { tooltip.remove(); });
        });
	}
	
	function addMouseHoverTooltipForAccountNotesStatus(element_) {
		const textContentFunc = () => {
			if(element_.classList.contains('status-init')) {
				return 'Account notes are very early in the initialization process.';
			} else if(element_.classList.contains('status-loading')) {
				return 'Account notes are loading...';
			} else if(element_.classList.contains('status-error')) {
				return 'Account notes failed to load.';
			} else if(element_.classList.contains('status-success')) {
				return 'Account notes were checked successfully.';
			} else {
				throw new Error(`account notes status element - unknown state.`);
			}
		}
		addMouseHoverTooltip(element_, textContentFunc);
	}

	function createMenuExpandedView(parentElem_) {
		let rootElem = document.createElement('div');
		parentElem_.appendChild(rootElem);
		rootElem.dataset.name = 'menu-expanded';
		rootElem.style = makeMenuExpandedViewStyleStr();

		let innerHtml = `
			<style>
				.status-init {
					display: inline-block; 
				}

				/* incredibly, this fully defines a spinning disc animation. */
				.status-loading {
					display: inline-block; 
					border: 0.5vw solid rgba(0, 0, 0, 0.1);
					border-radius: 50%;
					border-top: 0.5vw solid #3498db;
					width: 0.5vw; height: 0.5vw; 
					animation: spin 1s linear infinite;
					margin: 0.1vw auto;
				}

				@keyframes spin {
					0% { transform: rotate(0deg); }
					100% { transform: rotate(360deg); }
				}

				.status-success {
					display: inline-block; 
					min-width: 1.5vw; 
					font-size: 1.7em; 
				}

				.status-success::after {
					content: '✓';
				}

				.status-error {
					display: inline-block; 
					font-size: 2.0em; 
				}

				.status-error::after {
					content: '⚠';
					animation: status-error-flash 4s infinite;
				}

				@keyframes status-error-flash {
					0%, 50%, 100% {
						opacity: 1;
					}
					25%, 75% {
						opacity: 0;
					}
				}
			</style>
			<div style="font-size: 1.0vw">
				<button name="bulk-approve" title="Approve All Selected Rows" 
						aria-label="Approve All Selected" 
						style="width: 3vw; height: 3vw; padding: 0.1vw; border-width: 0.1vw; 
                            font-size: inherit; vertical-align: bottom;">
					A
				</button>
				<button name="bulk-reject" title="Reject All Selected Rows" 
						aria-label="Reject All Selected" 
						style="width: 3vw; height: 3vw; padding: 0.1vw; border-width: 0.1vw; 
                            font-size: inherit; vertical-align: bottom;">
					R
				</button>
				<button name="select-deselect-all" title="Select/Deselect All Rows" 
						aria-label="Select/Deselect All"
						style="width: 3vw; height: 3vw; padding: 0.1vw; border-width: 0.1vw; 
                            font-size: 1.7em; vertical-align: bottom;">
					☑
				</button>
				<button name="clear-filter" 
						title="Clear the rule filter.  (This refers to this script's rule filter, not the page's original rule filter.)" 
						aria-label="Clear Filter"
						style="width: 3vw; height: 3vw; padding: 0.1vw; border-width: 0.1vw; 
                            font-size: 1.7em; vertical-align: bottom;">
					🗑
				</button>
                &nbsp;&nbsp;
                <label>
                    Target date: <input placeholder="YYYY-MM-DD" style="font-size: inherit;" 
                        type="text" size="13">
                </label>
                &nbsp;&nbsp;
                <a href="${g_accountNotesGoogleSheetsUrlForEditing}">Account Notes</a>:
				<div id="account-notes-loading-status" class="status-init"></div>
                &nbsp;
				|&nbsp;&nbsp;<div id="page-is-loading-indicator" class="status-init"></div>
                &nbsp;&nbsp;
				<button name="close" title="close" aria-label="close" 
						style="float: right; margin: 0.2vw; z-index: 10; font-size: inherit;
							border-width: 0.3vw; padding: 0.3vw; margin: 0.1vw" 
					>✖</button>
                &nbsp;&nbsp;
			</div>`;
		rootElem.attachShadow({mode: 'open'}).innerHTML = innerHtml;

        let targetDateInputElem = rootElem.shadowRoot.querySelector(`input`);
        const targetDateStrFromStorage = GM_getValue("targetDate", "2024-08-01");
        updateTargetDateFromStr(targetDateStrFromStorage);
        targetDateInputElem.value = targetDateStrFromStorage;
        targetDateInputElem.addEventListener('keydown', function(event) {
            if(event.key === 'Enter') {
                let dateStr = this.value;
                if(updateTargetDateFromStr(dateStr)) {
                    GM_setValue("targetDate", dateStr);
                }
                refresh();
            }
        });

		initOurPageIsLoadingIndicator();

		function onCloseButtonClicked() {
			parentElem_.remove();
		}
		let closeButton = rootElem.shadowRoot.querySelector(`button[name="close"]`);
		closeButton.addEventListener("click", onCloseButtonClicked);

		return rootElem;
	}

	function waitForElementExistenceThenCallFunc(elementSelector_, callbackFunc_, 
			checkForElementIntervalMillis_ = 1000, checkForElementTimeoutMillis_ = 10*1000) {
		const startTime = Date.now();
		const intervalId = setInterval(() => {
			const element = document.querySelector(elementSelector_);
			if (element) {
				clearInterval(intervalId);
				callbackFunc_(element);
			} else if (Date.now() - startTime > checkForElementTimeoutMillis_) {
				clearInterval(intervalId);
				console.warn(`Element with selector "${elementSelector_}" not found`);
			}
		}, checkForElementIntervalMillis_);
	}

	function isEitherOrigPageIsLoadingIndicatorVisible() {
		return isOrigPageIsLoadingIndicatorInsideTableVisible() 
			|| isOrigPageIsLoadingIndicatorOutsideTableVisible();
	}

	function isOrigPageIsLoadingIndicatorInsideTableVisible() {
		let tbody = getTbodyOfTable();
		if(!tbody) return false;
		let spinner = tbody.querySelector('[data-component="spinner"]');
		let r = !!spinner;
		return r;
	}

	function isOrigPageIsLoadingIndicatorOutsideTableVisible() {
		let spinner = document.querySelector(
			'[data-component="pagination"] [data-component="spinner"]');
		if(!spinner) return false;
		let r = getComputedStyle(spinner).visibility === 'visible';
		return r;
	}

	function updateOurPageIsLoadingIndicatorBasedOnOrigIndicators() {
		let isLoading = isEitherOrigPageIsLoadingIndicatorVisible();
		let ourIndicator = getOurPageIsLoadingIndicatorElem();
		ourIndicator.className = isLoading ? 'status-loading' : 'status-success';
	}

	function initOurPageIsLoadingIndicatorTooltip() {
		let ourIndicator = getOurPageIsLoadingIndicatorElem();
		const textContentFunc = () => {
			let postamble = '  (This indicator mirrors the page\'s original loading indicator, '+
				'which is at the bottom of the screen.)';
			if(ourIndicator.classList.contains('status-init')) {
				return 'Page is very early in the initialization process.';
			} else if(ourIndicator.classList.contains('status-loading')) {
				return 'Page is refreshing.'+postamble;
			} else if(ourIndicator.classList.contains('status-error')) {
				throw new Error('impossible');
			} else if(ourIndicator.classList.contains('status-success')) {
				return 'Page has finished refreshing.'+postamble;
			} else {
				throw new Error(`page load indicator - unknown state.`);
			}
		}
		addMouseHoverTooltip(ourIndicator, textContentFunc);		
	}
	
	function initOurPageIsLoadingIndicator() {
		initOurPageIsLoadingIndicatorTooltip();
		updateOurPageIsLoadingIndicatorBasedOnOrigIndicators();
		function observerCallback(mutationsList__, observer__) {
			callThrottledFuncMaybe(updateOurPageIsLoadingIndicatorBasedOnOrigIndicators, 500, 100);
		};
		let observer = new MutationObserver(observerCallback);
		let observerOptions = {childList: true, attributes: true, subtree: true, 
			characterData: true};
		observer.observe(document, observerOptions);
	}

    function updateTargetDateFromStr(dateStr_) {
        const dateRegex = /^ *(\d{4})-(\d{2})-(\d{2}) *$/;
        const match = dateRegex.exec(dateStr_);
        if (match) {
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            const day = parseInt(match[3], 10);
            g_targetDate = {year: year, month: month, day: day};
        } else {
            g_targetDate = null;
        }
        return (g_targetDate !== null);
    }

	function checkCheckboxIfItsUnchecked(checkbox_) {
		if(!checkbox_.checked) {
			checkbox_.click();
		}
	}
	
	function uncheckCheckboxIfItsChecked(checkbox_) {
		if(checkbox_.checked) {
			checkbox_.click();
		}
	}

	function selectOrDeselectAll() {
		let thisIsASelectNotADeselect = false;
		let checkboxes = [];
		for(let ruleLinkElem of getAllRuleLinkElems()) {
			let trElem = ruleLinkElem.closest('tr');
			if(!isRowVisibleAccordingToOurRuleFilter(trElem)) continue;
			let checkbox = getCheckboxFromTrElem(trElem);
			if(!checkbox.checked) {
				thisIsASelectNotADeselect ||= true;
			}
			checkboxes.push(checkbox);
		}
		for(let checkbox of checkboxes) {
			if(thisIsASelectNotADeselect) {
				checkCheckboxIfItsUnchecked(checkbox);
			} else {
				uncheckCheckboxIfItsChecked(checkbox);
			}
		}
	}

	function initMenuListeners(expandedMenuRootElem_) {
		let ourBulkApproveButton = expandedMenuRootElem_.shadowRoot.querySelector(
			`button[name="bulk-approve"]`);
		function ourBulkApproveButtonClickListener() {
			let thePagesOriginalBulkApproveButton = document.querySelector(
				'div.bulk-actions_bulk-bar_wGCpL > button:nth-child(2)');
			if(thePagesOriginalBulkApproveButton) {
				thePagesOriginalBulkApproveButton.click();
			}
		}
		addEventListener(false, ourBulkApproveButton, "click", ourBulkApproveButtonClickListener);

		let ourBulkRejectButton = expandedMenuRootElem_.shadowRoot.querySelector(
			`button[name="bulk-reject"]`);
		function ourBulkRejectButtonClickListener() {
			let thePagesOriginalBulkRejectButton = document.querySelector(
				'div.bulk-actions_bulk-bar_wGCpL > button:nth-child(3)');
			if(thePagesOriginalBulkRejectButton) {
				thePagesOriginalBulkRejectButton.click();
			}
		}
		addEventListener(false, ourBulkRejectButton, "click", ourBulkRejectButtonClickListener);

		addEventListener(false, 
			expandedMenuRootElem_.shadowRoot.querySelector(`button[name="select-deselect-all"]`), 
			"click", selectOrDeselectAll);

        addEventListener(false, 
            expandedMenuRootElem_.shadowRoot.querySelector(`button[name="clear-filter"]`),
            "click", () => {
                g_filterRuleIdNum = null;
                refresh();
            });
	}

	function getCheckboxFromTrElem(trElem_) {
		assert(trElem_.tagName === "TR");
		let r = trElem_.querySelector('td:nth-of-type(1) input[type="checkbox"]');
		return r;
	}

	function getRuleLinkElemFromTrElem(trElem_) {
		assert(trElem_.tagName === "TR");
		let r = trElem_.querySelector('td:nth-of-type(2) a');
		return r;
	}
	
	async function runMain() {
		await miscInit();
		doOneTimeMods();
		createMenu();
        showNotesForAccount();
        addBeforeunloadListener();
		initMutationObserver();
		doOneRefreshMaybe();
	}

	function doOneTimeMods() {
		hideThePagesOriginalBulkActionsButtons();
        truncateActiveFilterButtons();
	}

    function addBeforeunloadListener() {
		window.addEventListener('beforeunload', function (event) {
			if(!isOurRuleFilterOn() && !isTheOriginalRuleFilterOn()) return;
			showMsgAsModal(`Rule filter(s) are on, so that's why you were asked if you `+
				`really want to leave this page.`);
			event.preventDefault();
			event.returnValue = ''; // chatgpt says: Chrome requires returnValue to be set.  
		 });
    }

	function isTheOriginalRuleFilterOn() {
		let r = false;
		for(let e of document.querySelectorAll('div[data-component="active-filters"] button')) {
			if(e.innerText.includes('Issue')) {
				r = true;
				break;
			}
		}
		return r;
	}
	
	function isOurRuleFilterOn() {
		return (g_filterRuleIdNum !== null);
	}

	function doOneRefreshMaybe() {
		callThrottledFuncMaybe(refresh, 500, 100);
	}

	function isPageLangEnglish() {
		let locale = document.documentElement.getAttribute('lang');
		let r = locale === 'en';
		return r;
	}

	function checkForPageLangEnglishAndMaybeWarnUser() {
		if(!isPageLangEnglish()) {
			alert("The page language is not English.  This function only works with english.  "+
				"So change the language to english, and try again.");
			return false;
		}
		return true;
	}

	function isRowForTheOldElementIdsAreNotUniqueRule(checkbox_) {
		let trElem = ancestor(checkbox_, 3);
		assert(trElem.tagName === "TR");
		let ruleLinkElem = trElem.querySelector('td:nth-of-type(2) a');
		let r = ruleLinkElem.innerText.includes("Element IDs are not unique");
		return r;
	}

	function doesRowHaveZeroAffectedPages(checkbox_) {
		let trElem = ancestor(checkbox_, 3)
		assert(trElem.tagName === "TR");
		let pageReportAnchorElem = trElem.querySelector('th:nth-of-type(1) > div > div > a');
		let rowHasNoPageReportLink = !pageReportAnchorElem;
		let pageReportColumnInnerText = trElem.querySelector('th:nth-of-type(1)').innerText;
		let doesPageReportColumnInnerTextSuggestZeroAffectedPages = 
			pageReportColumnInnerText.includes('No occurrences on any pages match this decision anymore');
		assert(rowHasNoPageReportLink == doesPageReportColumnInnerTextSuggestZeroAffectedPages);
		let r = rowHasNoPageReportLink;
		return r;
	}

	function selectAllRowsWithZeroAffectedPages() {
		if(!checkForPageLangEnglishAndMaybeWarnUser()) return;
		stopObserving();
		try {
			console.log(new Date(), "started selectAllRowsWithZeroAffectedPages");
			for(let checkbox of getAllVisibleCheckboxes()) {
				if(doesRowHaveZeroAffectedPages(checkbox)) {
					checkbox.click();
				}
			}
		} finally {
			refresh();
			startObserving();
			console.log(new Date(), "finished selectAllRowsWithZeroAffectedPages");
		}
	}

	function selectAllRowsForTheOldElementIdsAreNotUniqueRule() {
		if(!checkForPageLangEnglishAndMaybeWarnUser()) return;
		stopObserving();
		try {
			for(let checkbox of getAllVisibleCheckboxes()) {
				if(isRowForTheOldElementIdsAreNotUniqueRule(checkbox)) {
					checkbox.click();
				}
			}
		} finally {
			startObserving();
		}
	}

	let __throttleTestFuncLastCallTime = performance.now();

	function throttleTestFunc() {
		fakeCpuIntensiveTask(1200);
		let now = performance.now();
		console.log('throttleTestFunc: time since last call: ', now - __throttleTestFuncLastCallTime);
		__throttleTestFuncLastCallTime = now;
	}

	function fakeCpuIntensiveTask(durationMillis_) { 
		const endTime = performance.now() + durationMillis_;
		while(performance.now() < endTime) {
			Math.sqrt(Math.random());
		}
	}

    function selectCheckboxesAsPerJPMorgan_2024_09_10() {
		console.log(new Date(), "started selectCheckboxesAsPerJPMorgan_2024_09_10");
        const ruleIdNumsThatWeAreInterestedIn = new Set(["1", "4", "87", "61"]);
        const custPageUrlPrefixesThatWeAreInterestedIn = new Set([
            "https://am.jpmorgan.com/us/en/asset-management/institutional/insights/market-insights", 
            "https://am.jpmorgan.com/us/en/asset-management/liq/resources/morgan-money/morgan-money-learn-more-carousel/", 
            "https://am.jpmorgan.com/us/en/asset-management/mod/growth-equity-partners/", 
            "https://am.jpmorgan.com/us/en/asset-management/mod/growth-equity-partners0/", 
            "https://am.jpmorgan.com/us/en/asset-management/adv/insights/retirement-insights/defined-contribution/plan-sponsor-survey", 
            ]);
        let numInterestingCheckboxes = 0;
        for(let ruleLinkElem of getAllRuleLinkElems()) {
            const curRuleIdNum = getRuleIdNumFromUrl(ruleLinkElem.href);
            if(!ruleIdNumsThatWeAreInterestedIn.has(curRuleIdNum)) continue;
            let trElem = ruleLinkElem.closest('tr');
            let customerPageUrlSpanElem = trElem.querySelector('th:nth-of-type(1) > div > div > span');
            if(!customerPageUrlSpanElem) continue;
            let customerPageUrl = customerPageUrlSpanElem.innerText;
            let customerPageUrlStartsWithAnyPrefix = Array.from(custPageUrlPrefixesThatWeAreInterestedIn).some(prefix => customerPageUrl.startsWith(prefix));
            if(!customerPageUrlStartsWithAnyPrefix) continue;
            let checkbox = getCheckboxFromTrElem(trElem);
            if(!checkbox.checked) checkbox.click();
            numInterestingCheckboxes++;
        }    
		console.log(new Date(), `finished selectCheckboxesAsPerJPMorgan_2024_09_10.  number of checkboxes that we chose for selection (i.e. we selected them if they weren't selected already, and we left them alone if not): ${numInterestingCheckboxes}`);
    }

	function addKeyListeners() {
		function listener(e__) {
			if(e__.altKey && e__.ctrlKey && e__.key === 'z') {
				selectAllRowsWithZeroAffectedPages();
			} else if(e__.altKey && e__.ctrlKey && e__.key === 'd') {
				alert("That shortcut does nothing.  Did you mean Ctrl+Alt+z?  You pressed Ctrl+Alt+d.");
			} else if(e__.altKey && e__.ctrlKey && e__.key === 'i') {
				selectAllRowsForTheOldElementIdsAreNotUniqueRule();
			} else if(e__.altKey && e__.ctrlKey && e__.key === 'j') {
				selectCheckboxesAsPerJPMorgan_2024_09_10();
			} 
			
			if(0) {
				if(e__.altKey && e__.ctrlKey && e__.key === 't') {
					callThrottledFuncMaybe(throttleTestFunc, 1000, 250);
				}
			}
		}
		addEventListener(true, document, 'keydown', listener, false);
	}


	function callFuncOnDocumentReady(func_, runIfWeAreInAnIframe_) {
		if(!runIfWeAreInAnIframe_) {
			let areWeInAnIframe = window.self !== window.top;
			if(areWeInAnIframe) return;
		}
		if(document.readyState == "complete") {
			/* This will probably happen if we're running as a bookmarklet.  i.e. it's now 
			well after page load is finished. */
			func_();
		} else {
			/* This will happen if we're running as a tampermonkey script.  
			i.e. it's now well before page load is finished. */
			document.addEventListener("readystatechange", (event__) => {
				if(document.readyState === "complete") {
					func_();
				}
			});
		}
	}

/* JSJoda is below.  downloaded from https://cdn.jsdelivr.net/npm/@js-joda/core@5.6.0 then 
(because it had long lines which crashed vim) "unminified" with https://beautifier.io/ 
	- Dan Tripp, 2024-06-21 
*/

//! @version @js-joda/core - 5.6.0
//! @copyright (c) 2015-present, Philipp Thürwächter, Pattrick Hüper & js-joda contributors
//! @copyright (c) 2007-present, Stephen Colebourne & Michael Nascimento Santos
//! @license BSD-3-Clause (see LICENSE in the root directory of this source tree)
var JSJoda = function(t) {
    "use strict";

    function e(t, e, n) {
        function i(t) {
            Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : this.stack = (new Error).stack, this.message = t, e && e.apply(this, arguments), this.toString = function() {
                return this.name + ": " + this.message
            }
        }
        return void 0 === n && (n = Error), i.prototype = Object.create(n.prototype), i.prototype.name = t, i.prototype.constructor = i, i
    }
    var n = e("DateTimeException", (function(t, e) {
            void 0 === e && (e = null);
            var n = t || this.name;
            null !== e && e instanceof Error && (n += "\n-------\nCaused by: " + e.stack + "\n-------\n");
            this.message = n
        })),
        i = e("DateTimeParseException", (function(t, e, n, i) {
            void 0 === e && (e = "");
            void 0 === n && (n = 0);
            void 0 === i && (i = null);
            var r = t || this.name;
            r += ": " + e + ", at index: " + n, null !== i && i instanceof Error && (r += "\n-------\nCaused by: " + i.stack + "\n-------\n");
            this.message = r, this.parsedString = function() {
                return e
            }, this.errorIndex = function() {
                return n
            }
        })),
        r = e("UnsupportedTemporalTypeException", null, n),
        s = e("ArithmeticException"),
        o = e("IllegalArgumentException"),
        a = e("IllegalStateException"),
        u = e("NullPointerException");

    function h(t, e) {
        t.prototype = Object.create(e.prototype), t.prototype.constructor = t, f(t, e)
    }

    function f(t, e) {
        return f = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function(t, e) {
            return t.__proto__ = e, t
        }, f(t, e)
    }

    function c(t) {
        if (void 0 === t) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
        return t
    }

    function l(t, e, n) {
        if (!t) throw n ? new n(e) : new Error(e)
    }

    function _(t, e) {
        if (null == t) throw new u(e + " must not be null");
        return t
    }

    function d(t, e, n) {
        if (!(t instanceof e)) throw new o(n + " must be an instance of " + (e.name ? e.name : e) + (t && t.constructor && t.constructor.name ? ", but is " + t.constructor.name : ""));
        return t
    }

    function p(t) {
        throw new TypeError('abstract method "' + t + '" is not implemented')
    }
    var O = Object.freeze({
            __proto__: null,
            assert: l,
            requireNonNull: _,
            requireInstance: d,
            abstractMethodFail: p
        }),
        E = 9007199254740991,
        S = -9007199254740991,
        m = function() {
            function t() {}
            return t.intDiv = function(e, n) {
                var i = e / n;
                return i = t.roundDown(i), t.safeZero(i)
            }, t.intMod = function(e, n) {
                var i = e - t.intDiv(e, n) * n;
                return i = t.roundDown(i), t.safeZero(i)
            }, t.roundDown = function(t) {
                return t < 0 ? Math.ceil(t) : Math.floor(t)
            }, t.floorDiv = function(e, n) {
                var i = Math.floor(e / n);
                return t.safeZero(i)
            }, t.floorMod = function(e, n) {
                var i = e - t.floorDiv(e, n) * n;
                return t.safeZero(i)
            }, t.safeAdd = function(e, n) {
                if (t.verifyInt(e), t.verifyInt(n), 0 === e) return t.safeZero(n);
                if (0 === n) return t.safeZero(e);
                var i = t.safeToInt(e + n);
                if (i === e || i === n) throw new s("Invalid addition beyond MAX_SAFE_INTEGER!");
                return i
            }, t.safeSubtract = function(e, n) {
                return t.verifyInt(e), t.verifyInt(n), 0 === e && 0 === n ? 0 : 0 === e ? t.safeZero(-1 * n) : 0 === n ? t.safeZero(e) : t.safeToInt(e - n)
            }, t.safeMultiply = function(e, n) {
                if (t.verifyInt(e), t.verifyInt(n), 1 === e) return t.safeZero(n);
                if (1 === n) return t.safeZero(e);
                if (0 === e || 0 === n) return 0;
                var i = t.safeToInt(e * n);
                if (i / n !== e || e === S && -1 === n || n === S && -1 === e) throw new s("Multiplication overflows: " + e + " * " + n);
                return i
            }, t.parseInt = function(t) {
                function e(e) {
                    return t.apply(this, arguments)
                }
                return e.toString = function() {
                    return t.toString()
                }, e
            }((function(e) {
                var n = parseInt(e);
                return t.safeToInt(n)
            })), t.safeToInt = function(e) {
                return t.verifyInt(e), t.safeZero(e)
            }, t.verifyInt = function(t) {
                if (null == t) throw new s("Invalid value: '" + t + "', using null or undefined as argument");
                if (isNaN(t)) throw new s("Invalid int value, using NaN as argument");
                if (t % 1 != 0) throw new s("Invalid value: '" + t + "' is a float");
                if (t > E || t < S) throw new s("Calculation overflows an int: " + t)
            }, t.safeZero = function(t) {
                return 0 === t ? 0 : +t
            }, t.compareNumbers = function(t, e) {
                return t < e ? -1 : t > e ? 1 : 0
            }, t.smi = function(t) {
                return t >>> 1 & 1073741824 | 3221225471 & t
            }, t.hash = function(e) {
                if (e != e || e === 1 / 0) return 0;
                for (var n = e; e > 4294967295;) n ^= e /= 4294967295;
                return t.smi(n)
            }, t.hashCode = function() {
                for (var e = 17, n = arguments.length, i = new Array(n), r = 0; r < n; r++) i[r] = arguments[r];
                for (var s = 0, o = i; s < o.length; s++) {
                    var a = o[s];
                    e = (e << 5) - e + t.hash(a)
                }
                return t.hash(e)
            }, t
        }();
    m.MAX_SAFE_INTEGER = E, m.MIN_SAFE_INTEGER = S;
    var N = function() {
            function t(t) {
                this._name = t
            }
            var e = t.prototype;
            return e.equals = function(t) {
                return this === t
            }, e.toString = function() {
                return this._name
            }, e.toJSON = function() {
                return this.toString()
            }, t
        }(),
        D = function() {
            function t() {}
            var e = t.prototype;
            return e.get = function(t) {
                p("get")
            }, e.units = function() {
                p("units")
            }, e.addTo = function(t) {
                p("addTo")
            }, e.subtractFrom = function(t) {
                p("subtractFrom")
            }, t
        }();
    "undefined" != typeof Symbol && Symbol.toPrimitive && (D.prototype[Symbol.toPrimitive] = function(t) {
        if ("number" !== t) return this.toString();
        throw new TypeError("A conversion from TemporalAmount to a number is not allowed. To compare use the methods .equals(), .compareTo(), .isBefore() or one that is more suitable to your use case.")
    });
    var A = function() {
            function t() {}
            var e = t.prototype;
            return e.duration = function() {
                p("duration")
            }, e.isDurationEstimated = function() {
                p("isDurationEstimated")
            }, e.isDateBased = function() {
                p("isDateBased")
            }, e.isTimeBased = function() {
                p("isTimeBased")
            }, e.isSupportedBy = function(t) {
                p("isSupportedBy")
            }, e.addTo = function(t, e) {
                p("addTo")
            }, e.between = function(t, e) {
                p("between")
            }, t
        }(),
        T = function(t) {
            function e(e, n) {
                var i;
                return (i = t.call(this) || this)._seconds = m.safeToInt(e), i._nanos = m.safeToInt(n), i
            }
            h(e, t), e.ofDays = function(t) {
                return e._create(m.safeMultiply(t, fe.SECONDS_PER_DAY), 0)
            }, e.ofHours = function(t) {
                return e._create(m.safeMultiply(t, fe.SECONDS_PER_HOUR), 0)
            }, e.ofMinutes = function(t) {
                return e._create(m.safeMultiply(t, fe.SECONDS_PER_MINUTE), 0)
            }, e.ofSeconds = function(t, n) {
                void 0 === n && (n = 0);
                var i = m.safeAdd(t, m.floorDiv(n, fe.NANOS_PER_SECOND)),
                    r = m.floorMod(n, fe.NANOS_PER_SECOND);
                return e._create(i, r)
            }, e.ofMillis = function(t) {
                var n = m.intDiv(t, 1e3),
                    i = m.intMod(t, 1e3);
                return i < 0 && (i += 1e3, n--), e._create(n, 1e6 * i)
            }, e.ofNanos = function(t) {
                var e = m.intDiv(t, fe.NANOS_PER_SECOND),
                    n = m.intMod(t, fe.NANOS_PER_SECOND);
                return n < 0 && (n += fe.NANOS_PER_SECOND, e--), this._create(e, n)
            }, e.of = function(t, n) {
                return e.ZERO.plus(t, n)
            }, e.from = function(t) {
                _(t, "amount"), d(t, D);
                var n = e.ZERO;
                return t.units().forEach((function(e) {
                    n = n.plus(t.get(e), e)
                })), n
            }, e.between = function(t, e) {
                _(t, "startInclusive"), _(e, "endExclusive");
                var n = t.until(e, w.SECONDS),
                    i = 0;
                if (t.isSupported(R.NANO_OF_SECOND) && e.isSupported(R.NANO_OF_SECOND)) try {
                    var r = t.getLong(R.NANO_OF_SECOND);
                    if (i = e.getLong(R.NANO_OF_SECOND) - r, n > 0 && i < 0) i += fe.NANOS_PER_SECOND;
                    else if (n < 0 && i > 0) i -= fe.NANOS_PER_SECOND;
                    else if (0 === n && 0 !== i) {
                        var s = e.with(R.NANO_OF_SECOND, r);
                        n = t.until(s, w.SECONDS)
                    }
                } catch (t) {}
                return this.ofSeconds(n, i)
            }, e.parse = function(t) {
                _(t, "text");
                var n = new RegExp("([-+]?)P(?:([-+]?[0-9]+)D)?(T(?:([-+]?[0-9]+)H)?(?:([-+]?[0-9]+)M)?(?:([-+]?[0-9]+)(?:[.,]([0-9]{0,9}))?S)?)?", "i").exec(t);
                if (null !== n && "T" === n[3] == !1) {
                    var r = "-" === n[1],
                        s = n[2],
                        o = n[4],
                        a = n[5],
                        u = n[6],
                        h = n[7];
                    if (null != s || null != o || null != a || null != u) {
                        var f = e._parseNumber(t, s, fe.SECONDS_PER_DAY, "days"),
                            c = e._parseNumber(t, o, fe.SECONDS_PER_HOUR, "hours"),
                            l = e._parseNumber(t, a, fe.SECONDS_PER_MINUTE, "minutes"),
                            d = e._parseNumber(t, u, 1, "seconds"),
                            p = null != u && "-" === u.charAt(0),
                            O = e._parseFraction(t, h, p ? -1 : 1);
                        try {
                            return e._create(r, f, c, l, d, O)
                        } catch (e) {
                            throw new i("Text cannot be parsed to a Duration: overflow", t, 0, e)
                        }
                    }
                }
                throw new i("Text cannot be parsed to a Duration", t, 0)
            }, e._parseNumber = function(t, e, n, r) {
                if (null == e) return 0;
                try {
                    return "+" === e[0] && (e = e.substring(1)), m.safeMultiply(parseFloat(e), n)
                } catch (e) {
                    throw new i("Text cannot be parsed to a Duration: " + r, t, 0, e)
                }
            }, e._parseFraction = function(t, e, n) {
                return null == e || 0 === e.length ? 0 : (e = (e + "000000000").substring(0, 9), parseFloat(e) * n)
            }, e._create = function() {
                return arguments.length <= 2 ? e._createSecondsNanos(arguments[0], arguments[1]) : e._createNegateDaysHoursMinutesSecondsNanos(arguments[0], arguments[1], arguments[2], arguments[3], arguments[4], arguments[5])
            }, e._createNegateDaysHoursMinutesSecondsNanos = function(t, n, i, r, s, o) {
                var a = m.safeAdd(n, m.safeAdd(i, m.safeAdd(r, s)));
                return t ? e.ofSeconds(a, o).negated() : e.ofSeconds(a, o)
            }, e._createSecondsNanos = function(t, n) {
                return void 0 === t && (t = 0), void 0 === n && (n = 0), 0 === t && 0 === n ? e.ZERO : new e(t, n)
            };
            var n = e.prototype;
            return n.get = function(t) {
                if (t === w.SECONDS) return this._seconds;
                if (t === w.NANOS) return this._nanos;
                throw new r("Unsupported unit: " + t)
            }, n.units = function() {
                return [w.SECONDS, w.NANOS]
            }, n.isZero = function() {
                return 0 === this._seconds && 0 === this._nanos
            }, n.isNegative = function() {
                return this._seconds < 0
            }, n.seconds = function() {
                return this._seconds
            }, n.nano = function() {
                return this._nanos
            }, n.withSeconds = function(t) {
                return e._create(t, this._nanos)
            }, n.withNanos = function(t) {
                return R.NANO_OF_SECOND.checkValidIntValue(t), e._create(this._seconds, t)
            }, n.plusDuration = function(t) {
                return _(t, "duration"), this.plus(t.seconds(), t.nano())
            }, n.plus = function(t, e) {
                return 1 === arguments.length ? this.plusDuration(t) : 2 === arguments.length && e instanceof A ? this.plusAmountUnit(t, e) : this.plusSecondsNanos(t, e)
            }, n.plusAmountUnit = function(t, e) {
                if (_(t, "amountToAdd"), _(e, "unit"), e === w.DAYS) return this.plusSecondsNanos(m.safeMultiply(t, fe.SECONDS_PER_DAY), 0);
                if (e.isDurationEstimated()) throw new r("Unit must not have an estimated duration");
                if (0 === t) return this;
                if (e instanceof w) {
                    switch (e) {
                        case w.NANOS:
                            return this.plusNanos(t);
                        case w.MICROS:
                            return this.plusSecondsNanos(1e3 * m.intDiv(t, 1e9), 1e3 * m.intMod(t, 1e9));
                        case w.MILLIS:
                            return this.plusMillis(t);
                        case w.SECONDS:
                            return this.plusSeconds(t)
                    }
                    return this.plusSecondsNanos(m.safeMultiply(e.duration().seconds(), t), 0)
                }
                var n = e.duration().multipliedBy(t);
                return this.plusSecondsNanos(n.seconds(), n.nano())
            }, n.plusDays = function(t) {
                return this.plusSecondsNanos(m.safeMultiply(t, fe.SECONDS_PER_DAY), 0)
            }, n.plusHours = function(t) {
                return this.plusSecondsNanos(m.safeMultiply(t, fe.SECONDS_PER_HOUR), 0)
            }, n.plusMinutes = function(t) {
                return this.plusSecondsNanos(m.safeMultiply(t, fe.SECONDS_PER_MINUTE), 0)
            }, n.plusSeconds = function(t) {
                return this.plusSecondsNanos(t, 0)
            }, n.plusMillis = function(t) {
                return this.plusSecondsNanos(m.intDiv(t, 1e3), 1e6 * m.intMod(t, 1e3))
            }, n.plusNanos = function(t) {
                return this.plusSecondsNanos(0, t)
            }, n.plusSecondsNanos = function(t, n) {
                if (_(t, "secondsToAdd"), _(n, "nanosToAdd"), 0 === t && 0 === n) return this;
                var i = m.safeAdd(this._seconds, t);
                i = m.safeAdd(i, m.intDiv(n, fe.NANOS_PER_SECOND)), n = m.intMod(n, fe.NANOS_PER_SECOND);
                var r = m.safeAdd(this._nanos, n);
                return e.ofSeconds(i, r)
            }, n.minus = function(t, e) {
                return 1 === arguments.length ? this.minusDuration(t) : this.minusAmountUnit(t, e)
            }, n.minusDuration = function(t) {
                _(t, "duration");
                var e = t.seconds(),
                    n = t.nano();
                return e === S ? this.plus(E, -n) : this.plus(-e, -n)
            }, n.minusAmountUnit = function(t, e) {
                return _(t, "amountToSubtract"), _(e, "unit"), t === S ? this.plusAmountUnit(E, e) : this.plusAmountUnit(-t, e)
            }, n.minusDays = function(t) {
                return t === S ? this.plusDays(E) : this.plusDays(-t)
            }, n.minusHours = function(t) {
                return t === S ? this.plusHours(E) : this.plusHours(-t)
            }, n.minusMinutes = function(t) {
                return t === S ? this.plusMinutes(E) : this.plusMinutes(-t)
            }, n.minusSeconds = function(t) {
                return t === S ? this.plusSeconds(E) : this.plusSeconds(-t)
            }, n.minusMillis = function(t) {
                return t === S ? this.plusMillis(E) : this.plusMillis(-t)
            }, n.minusNanos = function(t) {
                return t === S ? this.plusNanos(E) : this.plusNanos(-t)
            }, n.multipliedBy = function(t) {
                if (0 === t) return e.ZERO;
                if (1 === t) return this;
                var n = m.safeMultiply(this._seconds, t),
                    i = m.safeMultiply(this._nanos, t);
                return n += m.intDiv(i, fe.NANOS_PER_SECOND), i = m.intMod(i, fe.NANOS_PER_SECOND), e.ofSeconds(n, i)
            }, n.dividedBy = function(t) {
                if (0 === t) throw new s("Cannot divide by zero");
                if (1 === t) return this;
                var n = m.intDiv(this._seconds, t),
                    i = m.roundDown((this._seconds / t - n) * fe.NANOS_PER_SECOND),
                    r = m.intDiv(this._nanos, t);
                return r = i + r, e.ofSeconds(n, r)
            }, n.negated = function() {
                return this.multipliedBy(-1)
            }, n.abs = function() {
                return this.isNegative() ? this.negated() : this
            }, n.addTo = function(t) {
                return _(t, "temporal"), 0 !== this._seconds && (t = t.plus(this._seconds, w.SECONDS)), 0 !== this._nanos && (t = t.plus(this._nanos, w.NANOS)), t
            }, n.subtractFrom = function(t) {
                return _(t, "temporal"), 0 !== this._seconds && (t = t.minus(this._seconds, w.SECONDS)), 0 !== this._nanos && (t = t.minus(this._nanos, w.NANOS)), t
            }, n.toDays = function() {
                return m.intDiv(this._seconds, fe.SECONDS_PER_DAY)
            }, n.toHours = function() {
                return m.intDiv(this._seconds, fe.SECONDS_PER_HOUR)
            }, n.toMinutes = function() {
                return m.intDiv(this._seconds, fe.SECONDS_PER_MINUTE)
            }, n.toMillis = function() {
                var t = Math.round(m.safeMultiply(this._seconds, 1e3));
                return t = m.safeAdd(t, m.intDiv(this._nanos, 1e6))
            }, n.toNanos = function() {
                var t = m.safeMultiply(this._seconds, fe.NANOS_PER_SECOND);
                return t = m.safeAdd(t, this._nanos)
            }, n.compareTo = function(t) {
                _(t, "otherDuration"), d(t, e, "otherDuration");
                var n = m.compareNumbers(this._seconds, t.seconds());
                return 0 !== n ? n : this._nanos - t.nano()
            }, n.equals = function(t) {
                return this === t || t instanceof e && (this.seconds() === t.seconds() && this.nano() === t.nano())
            }, n.toString = function() {
                if (this === e.ZERO) return "PT0S";
                var t, n = m.intDiv(this._seconds, fe.SECONDS_PER_HOUR),
                    i = m.intDiv(m.intMod(this._seconds, fe.SECONDS_PER_HOUR), fe.SECONDS_PER_MINUTE),
                    r = m.intMod(this._seconds, fe.SECONDS_PER_MINUTE),
                    s = "PT";
                if (0 !== n && (s += n + "H"), 0 !== i && (s += i + "M"), 0 === r && 0 === this._nanos && s.length > 2) return s;
                if (r < 0 && this._nanos > 0 ? s += -1 === r ? "-0" : r + 1 : s += r, this._nanos > 0)
                    for (s += ".", s += t = (t = r < 0 ? "" + (2 * fe.NANOS_PER_SECOND - this._nanos) : "" + (fe.NANOS_PER_SECOND + this._nanos)).slice(1, t.length);
                        "0" === s.charAt(s.length - 1);) s = s.slice(0, s.length - 1);
                return s += "S"
            }, n.toJSON = function() {
                return this.toString()
            }, e
        }(D);
    var v = function() {};
    var w = function(t) {
        function e(e, n) {
            var i;
            return (i = t.call(this) || this)._name = e, i._duration = n, i
        }
        h(e, t);
        var n = e.prototype;
        return n.duration = function() {
            return this._duration
        }, n.isDurationEstimated = function() {
            return this.isDateBased() || this === e.FOREVER
        }, n.isDateBased = function() {
            return this.compareTo(e.DAYS) >= 0 && this !== e.FOREVER
        }, n.isTimeBased = function() {
            return this.compareTo(e.DAYS) < 0
        }, n.isSupportedBy = function(t) {
            if (this === e.FOREVER) return !1;
            try {
                return t.plus(1, this), !0
            } catch (e) {
                try {
                    return t.plus(-1, this), !0
                } catch (t) {
                    return !1
                }
            }
        }, n.addTo = function(t, e) {
            return t.plus(e, this)
        }, n.between = function(t, e) {
            return t.until(e, this)
        }, n.toString = function() {
            return this._name
        }, n.compareTo = function(t) {
            return this.duration().compareTo(t.duration())
        }, e
    }(A);
    var y = function() {
            function t() {}
            var e = t.prototype;
            return e.isDateBased = function() {
                p("isDateBased")
            }, e.isTimeBased = function() {
                p("isTimeBased")
            }, e.baseUnit = function() {
                p("baseUnit")
            }, e.rangeUnit = function() {
                p("rangeUnit")
            }, e.range = function() {
                p("range")
            }, e.rangeRefinedBy = function(t) {
                p("rangeRefinedBy")
            }, e.getFrom = function(t) {
                p("getFrom")
            }, e.adjustInto = function(t, e) {
                p("adjustInto")
            }, e.isSupportedBy = function(t) {
                p("isSupportedBy")
            }, e.displayName = function() {
                p("displayName")
            }, e.equals = function(t) {
                p("equals")
            }, e.name = function() {
                p("name")
            }, t
        }(),
        M = function() {
            function t(t, e, n, i) {
                l(!(t > e), "Smallest minimum value '" + t + "' must be less than largest minimum value '" + e + "'", o), l(!(n > i), "Smallest maximum value '" + n + "' must be less than largest maximum value '" + i + "'", o), l(!(e > i), "Minimum value '" + e + "' must be less than maximum value '" + i + "'", o), this._minSmallest = t, this._minLargest = e, this._maxLargest = i, this._maxSmallest = n
            }
            var e = t.prototype;
            return e.isFixed = function() {
                return this._minSmallest === this._minLargest && this._maxSmallest === this._maxLargest
            }, e.minimum = function() {
                return this._minSmallest
            }, e.largestMinimum = function() {
                return this._minLargest
            }, e.maximum = function() {
                return this._maxLargest
            }, e.smallestMaximum = function() {
                return this._maxSmallest
            }, e.isValidValue = function(t) {
                return this.minimum() <= t && t <= this.maximum()
            }, e.checkValidValue = function(t, e) {
                return this.isValidValue(t) ? t : l(!1, null != e ? "Invalid value for " + e + " (valid values " + this.toString() + "): " + t : "Invalid value (valid values " + this.toString() + "): " + t, n)
            }, e.checkValidIntValue = function(t, e) {
                if (!1 === this.isValidIntValue(t)) throw new n("Invalid int value for " + e + ": " + t);
                return t
            }, e.isValidIntValue = function(t) {
                return this.isIntValue() && this.isValidValue(t)
            }, e.isIntValue = function() {
                return this.minimum() >= m.MIN_SAFE_INTEGER && this.maximum() <= m.MAX_SAFE_INTEGER
            }, e.equals = function(e) {
                return e === this || e instanceof t && (this._minSmallest === e._minSmallest && this._minLargest === e._minLargest && this._maxSmallest === e._maxSmallest && this._maxLargest === e._maxLargest)
            }, e.hashCode = function() {
                return m.hashCode(this._minSmallest, this._minLargest, this._maxSmallest, this._maxLargest)
            }, e.toString = function() {
                var t = this.minimum() + (this.minimum() !== this.largestMinimum() ? "/" + this.largestMinimum() : "");
                return t += " - ", t += this.smallestMaximum() + (this.smallestMaximum() !== this.maximum() ? "/" + this.maximum() : "")
            }, t.of = function() {
                return 2 === arguments.length ? new t(arguments[0], arguments[0], arguments[1], arguments[1]) : 3 === arguments.length ? new t(arguments[0], arguments[0], arguments[1], arguments[2]) : 4 === arguments.length ? new t(arguments[0], arguments[1], arguments[2], arguments[3]) : l(!1, "Invalid number of arguments " + arguments.length, o)
            }, t
        }(),
        R = function(t) {
            function e(e, n, i, r) {
                var s;
                return (s = t.call(this) || this)._name = e, s._baseUnit = n, s._rangeUnit = i, s._range = r, s
            }
            h(e, t), e.byName = function(t) {
                for (var n in e)
                    if (e[n] && e[n] instanceof e && e[n].name() === t) return e[n]
            };
            var n = e.prototype;
            return n.name = function() {
                return this._name
            }, n.baseUnit = function() {
                return this._baseUnit
            }, n.rangeUnit = function() {
                return this._rangeUnit
            }, n.range = function() {
                return this._range
            }, n.displayName = function() {
                return this.toString()
            }, n.checkValidValue = function(t) {
                return this.range().checkValidValue(t, this)
            }, n.checkValidIntValue = function(t) {
                return this.range().checkValidIntValue(t, this)
            }, n.isDateBased = function() {
                return this === e.DAY_OF_WEEK || this === e.ALIGNED_DAY_OF_WEEK_IN_MONTH || this === e.ALIGNED_DAY_OF_WEEK_IN_YEAR || this === e.DAY_OF_MONTH || this === e.DAY_OF_YEAR || this === e.EPOCH_DAY || this === e.ALIGNED_WEEK_OF_MONTH || this === e.ALIGNED_WEEK_OF_YEAR || this === e.MONTH_OF_YEAR || this === e.PROLEPTIC_MONTH || this === e.YEAR_OF_ERA || this === e.YEAR || this === e.ERA
            }, n.isTimeBased = function() {
                return this === e.NANO_OF_SECOND || this === e.NANO_OF_DAY || this === e.MICRO_OF_SECOND || this === e.MICRO_OF_DAY || this === e.MILLI_OF_SECOND || this === e.MILLI_OF_DAY || this === e.SECOND_OF_MINUTE || this === e.SECOND_OF_DAY || this === e.MINUTE_OF_HOUR || this === e.MINUTE_OF_DAY || this === e.HOUR_OF_AMPM || this === e.CLOCK_HOUR_OF_AMPM || this === e.HOUR_OF_DAY || this === e.CLOCK_HOUR_OF_DAY || this === e.AMPM_OF_DAY
            }, n.rangeRefinedBy = function(t) {
                return t.range(this)
            }, n.getFrom = function(t) {
                return t.getLong(this)
            }, n.toString = function() {
                return this.name()
            }, n.equals = function(t) {
                return this === t
            }, n.adjustInto = function(t, e) {
                return t.with(this, e)
            }, n.isSupportedBy = function(t) {
                return t.isSupported(this)
            }, e
        }(y);
    var g = function() {
            function t() {}
            return t.zoneId = function() {
                return t.ZONE_ID
            }, t.chronology = function() {
                return t.CHRONO
            }, t.precision = function() {
                return t.PRECISION
            }, t.zone = function() {
                return t.ZONE
            }, t.offset = function() {
                return t.OFFSET
            }, t.localDate = function() {
                return t.LOCAL_DATE
            }, t.localTime = function() {
                return t.LOCAL_TIME
            }, t
        }(),
        I = function() {
            function t() {}
            var e = t.prototype;
            return e.query = function(t) {
                return t === g.zoneId() || t === g.chronology() || t === g.precision() ? null : t.queryFrom(this)
            }, e.get = function(t) {
                return this.range(t).checkValidIntValue(this.getLong(t), t)
            }, e.getLong = function(t) {
                p("getLong")
            }, e.range = function(t) {
                if (t instanceof R) {
                    if (this.isSupported(t)) return t.range();
                    throw new r("Unsupported field: " + t)
                }
                return t.rangeRefinedBy(this)
            }, e.isSupported = function(t) {
                p("isSupported")
            }, t
        }(),
        F = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            return h(e, t), e.prototype.queryFrom = function(t) {
                p("queryFrom")
            }, e
        }(N);

    function Y(t, e) {
        var n = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            return h(e, t), e
        }(F);
        return n.prototype.queryFrom = e, new n(t)
    }
    var C, L = function(t) {
        function e(e, n) {
            var i;
            return (i = t.call(this) || this)._ordinal = e, i._name = n, i
        }
        h(e, t);
        var i = e.prototype;
        return i.ordinal = function() {
            return this._ordinal
        }, i.name = function() {
            return this._name
        }, e.values = function() {
            return C.slice()
        }, e.valueOf = function(t) {
            for (var n = 0; n < C.length && C[n].name() !== t; n++);
            return e.of(n + 1)
        }, e.of = function(t) {
            if (t < 1 || t > 7) throw new n("Invalid value for DayOfWeek: " + t);
            return C[t - 1]
        }, e.from = function(t) {
            if (l(null != t, "temporal", u), t instanceof e) return t;
            try {
                return e.of(t.get(R.DAY_OF_WEEK))
            } catch (e) {
                throw e instanceof n ? new n("Unable to obtain DayOfWeek from TemporalAccessor: " + t + ", type " + (null != t.constructor ? t.constructor.name : ""), e) : e
            }
        }, i.value = function() {
            return this._ordinal + 1
        }, i.displayName = function(t, e) {
            throw new o("Pattern using (localized) text not implemented yet!")
        }, i.isSupported = function(t) {
            return t instanceof R ? t === R.DAY_OF_WEEK : null != t && t.isSupportedBy(this)
        }, i.range = function(t) {
            if (t === R.DAY_OF_WEEK) return t.range();
            if (t instanceof R) throw new r("Unsupported field: " + t);
            return t.rangeRefinedBy(this)
        }, i.get = function(t) {
            return t === R.DAY_OF_WEEK ? this.value() : this.range(t).checkValidIntValue(this.getLong(t), t)
        }, i.getLong = function(t) {
            if (t === R.DAY_OF_WEEK) return this.value();
            if (t instanceof R) throw new r("Unsupported field: " + t);
            return t.getFrom(this)
        }, i.plus = function(t) {
            var e = m.floorMod(t, 7);
            return C[m.floorMod(this._ordinal + (e + 7), 7)]
        }, i.minus = function(t) {
            return this.plus(-1 * m.floorMod(t, 7))
        }, i.query = function(t) {
            return t === g.precision() ? w.DAYS : t === g.localDate() || t === g.localTime() || t === g.chronology() || t === g.zone() || t === g.zoneId() || t === g.offset() ? null : (l(null != t, "query", u), t.queryFrom(this))
        }, i.adjustInto = function(t) {
            return _(t, "temporal"), t.with(R.DAY_OF_WEEK, this.value())
        }, i.equals = function(t) {
            return this === t
        }, i.toString = function() {
            return this._name
        }, i.compareTo = function(t) {
            return _(t, "other"), d(t, e, "other"), this._ordinal - t._ordinal
        }, i.toJSON = function() {
            return this.toString()
        }, e
    }(I);
    var P, U = function(t) {
        function e(e, n) {
            var i;
            return (i = t.call(this) || this)._value = m.safeToInt(e), i._name = n, i
        }
        h(e, t);
        var i = e.prototype;
        return i.value = function() {
            return this._value
        }, i.ordinal = function() {
            return this._value - 1
        }, i.name = function() {
            return this._name
        }, i.displayName = function(t, e) {
            throw new o("Pattern using (localized) text not implemented yet!")
        }, i.isSupported = function(t) {
            return null !== t && (t instanceof R ? t === R.MONTH_OF_YEAR : null != t && t.isSupportedBy(this))
        }, i.get = function(t) {
            return t === R.MONTH_OF_YEAR ? this.value() : this.range(t).checkValidIntValue(this.getLong(t), t)
        }, i.getLong = function(t) {
            if (t === R.MONTH_OF_YEAR) return this.value();
            if (t instanceof R) throw new r("Unsupported field: " + t);
            return t.getFrom(this)
        }, i.plus = function(t) {
            var n = m.intMod(t, 12) + 12,
                i = m.intMod(this.value() + n, 12);
            return i = 0 === i ? 12 : i, e.of(i)
        }, i.minus = function(t) {
            return this.plus(-1 * m.intMod(t, 12))
        }, i.length = function(t) {
            switch (this) {
                case e.FEBRUARY:
                    return t ? 29 : 28;
                case e.APRIL:
                case e.JUNE:
                case e.SEPTEMBER:
                case e.NOVEMBER:
                    return 30;
                default:
                    return 31
            }
        }, i.minLength = function() {
            switch (this) {
                case e.FEBRUARY:
                    return 28;
                case e.APRIL:
                case e.JUNE:
                case e.SEPTEMBER:
                case e.NOVEMBER:
                    return 30;
                default:
                    return 31
            }
        }, i.maxLength = function() {
            switch (this) {
                case e.FEBRUARY:
                    return 29;
                case e.APRIL:
                case e.JUNE:
                case e.SEPTEMBER:
                case e.NOVEMBER:
                    return 30;
                default:
                    return 31
            }
        }, i.firstDayOfYear = function(t) {
            var n = t ? 1 : 0;
            switch (this) {
                case e.JANUARY:
                    return 1;
                case e.FEBRUARY:
                    return 32;
                case e.MARCH:
                    return 60 + n;
                case e.APRIL:
                    return 91 + n;
                case e.MAY:
                    return 121 + n;
                case e.JUNE:
                    return 152 + n;
                case e.JULY:
                    return 182 + n;
                case e.AUGUST:
                    return 213 + n;
                case e.SEPTEMBER:
                    return 244 + n;
                case e.OCTOBER:
                    return 274 + n;
                case e.NOVEMBER:
                    return 305 + n;
                case e.DECEMBER:
                default:
                    return 335 + n
            }
        }, i.firstMonthOfQuarter = function() {
            switch (this) {
                case e.JANUARY:
                case e.FEBRUARY:
                case e.MARCH:
                    return e.JANUARY;
                case e.APRIL:
                case e.MAY:
                case e.JUNE:
                    return e.APRIL;
                case e.JULY:
                case e.AUGUST:
                case e.SEPTEMBER:
                    return e.JULY;
                case e.OCTOBER:
                case e.NOVEMBER:
                case e.DECEMBER:
                default:
                    return e.OCTOBER
            }
        }, i.query = function(e) {
            return l(null != e, "query() parameter must not be null", n), e === g.chronology() ? te.INSTANCE : e === g.precision() ? w.MONTHS : t.prototype.query.call(this, e)
        }, i.toString = function() {
            switch (this) {
                case e.JANUARY:
                    return "JANUARY";
                case e.FEBRUARY:
                    return "FEBRUARY";
                case e.MARCH:
                    return "MARCH";
                case e.APRIL:
                    return "APRIL";
                case e.MAY:
                    return "MAY";
                case e.JUNE:
                    return "JUNE";
                case e.JULY:
                    return "JULY";
                case e.AUGUST:
                    return "AUGUST";
                case e.SEPTEMBER:
                    return "SEPTEMBER";
                case e.OCTOBER:
                    return "OCTOBER";
                case e.NOVEMBER:
                    return "NOVEMBER";
                case e.DECEMBER:
                    return "DECEMBER";
                default:
                    return "unknown Month, value: " + this.value()
            }
        }, i.toJSON = function() {
            return this.toString()
        }, i.adjustInto = function(t) {
            return t.with(R.MONTH_OF_YEAR, this.value())
        }, i.compareTo = function(t) {
            return _(t, "other"), d(t, e, "other"), this._value - t._value
        }, i.equals = function(t) {
            return this === t
        }, e.valueOf = function(t) {
            for (var n = 0; n < P.length && P[n].name() !== t; n++);
            return e.of(n + 1)
        }, e.values = function() {
            return P.slice()
        }, e.of = function(t) {
            return (t < 1 || t > 12) && l(!1, "Invalid value for MonthOfYear: " + t, n), P[t - 1]
        }, e.from = function(t) {
            if (t instanceof e) return t;
            try {
                return e.of(t.get(R.MONTH_OF_YEAR))
            } catch (e) {
                throw new n("Unable to obtain Month from TemporalAccessor: " + t + " of type " + (t && null != t.constructor ? t.constructor.name : ""), e)
            }
        }, e
    }(I);
    var V = /([-+]?)P(?:([-+]?[0-9]+)Y)?(?:([-+]?[0-9]+)M)?(?:([-+]?[0-9]+)W)?(?:([-+]?[0-9]+)D)?/,
        b = function(t) {
            function e(n, i, r) {
                var s;
                s = t.call(this) || this;
                var o = m.safeToInt(n),
                    a = m.safeToInt(i),
                    u = m.safeToInt(r);
                return 0 === o && 0 === a && 0 === u ? (e.ZERO || (s._years = o, s._months = a, s._days = u, e.ZERO = c(s)), e.ZERO || c(s)) : (s._years = o, s._months = a, s._days = u, s)
            }
            h(e, t), e.ofYears = function(t) {
                return e.create(t, 0, 0)
            }, e.ofMonths = function(t) {
                return e.create(0, t, 0)
            }, e.ofWeeks = function(t) {
                return e.create(0, 0, m.safeMultiply(t, 7))
            }, e.ofDays = function(t) {
                return e.create(0, 0, t)
            }, e.of = function(t, n, i) {
                return e.create(t, n, i)
            }, e.from = function(t) {
                if (t instanceof e) return t;
                _(t, "amount");
                for (var i = 0, r = 0, s = 0, o = t.units(), a = 0; a < o.length; a++) {
                    var u = o[a],
                        h = t.get(u);
                    if (u === w.YEARS) i = m.safeToInt(h);
                    else if (u === w.MONTHS) r = m.safeToInt(h);
                    else {
                        if (u !== w.DAYS) throw new n("Unit must be Years, Months or Days, but was " + u);
                        s = m.safeToInt(h)
                    }
                }
                return e.create(i, r, s)
            }, e.between = function(t, e) {
                return _(t, "startDate"), _(e, "endDate"), d(t, ae, "startDate"), d(e, ae, "endDate"), t.until(e)
            }, e.parse = function(t) {
                _(t, "text");
                try {
                    return e._parse(t)
                } catch (e) {
                    throw e instanceof s ? new i("Text cannot be parsed to a Period", t, 0, e) : e
                }
            }, e._parse = function(t) {
                var n = V.exec(t);
                if (null != n) {
                    var r = "-" === n[1] ? -1 : 1,
                        s = n[2],
                        o = n[3],
                        a = n[4],
                        u = n[5];
                    if (null != s || null != o || null != a || null != u) {
                        var h = e._parseNumber(t, s, r),
                            f = e._parseNumber(t, o, r),
                            c = e._parseNumber(t, a, r),
                            l = e._parseNumber(t, u, r);
                        return l = m.safeAdd(l, m.safeMultiply(c, 7)), e.create(h, f, l)
                    }
                }
                throw new i("Text cannot be parsed to a Period", t, 0)
            }, e._parseNumber = function(t, e, n) {
                if (null == e) return 0;
                var i = m.parseInt(e);
                return m.safeMultiply(i, n)
            }, e.create = function(t, n, i) {
                return new e(t, n, i)
            };
            var o = e.prototype;
            return o.units = function() {
                return [w.YEARS, w.MONTHS, w.DAYS]
            }, o.chronology = function() {
                return te.INSTANCE
            }, o.get = function(t) {
                if (t === w.YEARS) return this._years;
                if (t === w.MONTHS) return this._months;
                if (t === w.DAYS) return this._days;
                throw new r("Unsupported unit: " + t)
            }, o.isZero = function() {
                return this === e.ZERO
            }, o.isNegative = function() {
                return this._years < 0 || this._months < 0 || this._days < 0
            }, o.years = function() {
                return this._years
            }, o.months = function() {
                return this._months
            }, o.days = function() {
                return this._days
            }, o.withYears = function(t) {
                return t === this._years ? this : e.create(t, this._months, this._days)
            }, o.withMonths = function(t) {
                return t === this._months ? this : e.create(this._years, t, this._days)
            }, o.withDays = function(t) {
                return t === this._days ? this : e.create(this._years, this._months, t)
            }, o.plus = function(t) {
                var n = e.from(t);
                return e.create(m.safeAdd(this._years, n._years), m.safeAdd(this._months, n._months), m.safeAdd(this._days, n._days))
            }, o.plusYears = function(t) {
                return 0 === t ? this : e.create(m.safeToInt(m.safeAdd(this._years, t)), this._months, this._days)
            }, o.plusMonths = function(t) {
                return 0 === t ? this : e.create(this._years, m.safeToInt(m.safeAdd(this._months, t)), this._days)
            }, o.plusDays = function(t) {
                return 0 === t ? this : e.create(this._years, this._months, m.safeToInt(m.safeAdd(this._days, t)))
            }, o.minus = function(t) {
                var n = e.from(t);
                return e.create(m.safeSubtract(this._years, n._years), m.safeSubtract(this._months, n._months), m.safeSubtract(this._days, n._days))
            }, o.minusYears = function(t) {
                return this.plusYears(-1 * t)
            }, o.minusMonths = function(t) {
                return this.plusMonths(-1 * t)
            }, o.minusDays = function(t) {
                return this.plusDays(-1 * t)
            }, o.multipliedBy = function(t) {
                return this === e.ZERO || 1 === t ? this : e.create(m.safeMultiply(this._years, t), m.safeMultiply(this._months, t), m.safeMultiply(this._days, t))
            }, o.negated = function() {
                return this.multipliedBy(-1)
            }, o.normalized = function() {
                var t = this.toTotalMonths(),
                    n = m.intDiv(t, 12),
                    i = m.intMod(t, 12);
                return n === this._years && i === this._months ? this : e.create(m.safeToInt(n), i, this._days)
            }, o.toTotalMonths = function() {
                return 12 * this._years + this._months
            }, o.addTo = function(t) {
                return _(t, "temporal"), 0 !== this._years ? t = 0 !== this._months ? t.plus(this.toTotalMonths(), w.MONTHS) : t.plus(this._years, w.YEARS) : 0 !== this._months && (t = t.plus(this._months, w.MONTHS)), 0 !== this._days && (t = t.plus(this._days, w.DAYS)), t
            }, o.subtractFrom = function(t) {
                return _(t, "temporal"), 0 !== this._years ? t = 0 !== this._months ? t.minus(this.toTotalMonths(), w.MONTHS) : t.minus(this._years, w.YEARS) : 0 !== this._months && (t = t.minus(this._months, w.MONTHS)), 0 !== this._days && (t = t.minus(this._days, w.DAYS)), t
            }, o.equals = function(t) {
                if (this === t) return !0;
                if (t instanceof e) {
                    var n = t;
                    return this._years === n._years && this._months === n._months && this._days === n._days
                }
                return !1
            }, o.hashCode = function() {
                return m.hashCode(this._years, this._months, this._days)
            }, o.toString = function() {
                if (this === e.ZERO) return "P0D";
                var t = "P";
                return 0 !== this._years && (t += this._years + "Y"), 0 !== this._months && (t += this._months + "M"), 0 !== this._days && (t += this._days + "D"), t
            }, o.toJSON = function() {
                return this.toString()
            }, e
        }(D);
    var H = function() {
            function t(t) {
                this._index = t, this._errorIndex = -1
            }
            var e = t.prototype;
            return e.getIndex = function() {
                return this._index
            }, e.setIndex = function(t) {
                this._index = t
            }, e.getErrorIndex = function() {
                return this._errorIndex
            }, e.setErrorIndex = function(t) {
                this._errorIndex = t
            }, t
        }(),
        W = function() {
            function t() {
                this._map = {}
            }
            var e = t.prototype;
            return e.putAll = function(t) {
                for (var e in t._map) this._map[e] = t._map[e];
                return this
            }, e.containsKey = function(t) {
                return this._map.hasOwnProperty(t.name()) && void 0 !== this.get(t)
            }, e.get = function(t) {
                return this._map[t.name()]
            }, e.put = function(t, e) {
                return this.set(t, e)
            }, e.set = function(t, e) {
                return this._map[t.name()] = e, this
            }, e.retainAll = function(t) {
                for (var e = {}, n = 0; n < t.length; n++) {
                    var i = t[n].name();
                    e[i] = this._map[i]
                }
                return this._map = e, this
            }, e.remove = function(t) {
                var e = t.name(),
                    n = this._map[e];
                return this._map[e] = void 0, n
            }, e.keySet = function() {
                return this._map
            }, e.clear = function() {
                this._map = {}
            }, t
        }(),
        x = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            return h(e, t), e
        }(N);
    x.STRICT = new x("STRICT"), x.SMART = new x("SMART"), x.LENIENT = new x("LENIENT");
    var k = function(t) {
        function e() {
            return t.apply(this, arguments) || this
        }
        h(e, t);
        var n = e.prototype;
        return n.isSupported = function(t) {
            p("isSupported")
        }, n.minus = function(t, e) {
            return arguments.length < 2 ? this._minusAmount(t) : this._minusUnit(t, e)
        }, n._minusAmount = function(t) {
            return _(t, "amount"), d(t, D, "amount"), t.subtractFrom(this)
        }, n._minusUnit = function(t, e) {
            return _(t, "amountToSubtract"), _(e, "unit"), d(e, A, "unit"), this._plusUnit(-t, e)
        }, n.plus = function(t, e) {
            return arguments.length < 2 ? this._plusAmount(t) : this._plusUnit(t, e)
        }, n._plusAmount = function(t) {
            return _(t, "amount"), d(t, D, "amount"), t.addTo(this)
        }, n._plusUnit = function(t, e) {
            p("_plusUnit")
        }, n.until = function(t, e) {
            p("until")
        }, n.with = function(t, e) {
            return arguments.length < 2 ? this._withAdjuster(t) : this._withField(t, e)
        }, n._withAdjuster = function(t) {
            return _(t, "adjuster"), l("function" == typeof t.adjustInto, "adjuster must be a TemporalAdjuster", o), t.adjustInto(this)
        }, n._withField = function(t, e) {
            p("_withField")
        }, e
    }(I);
    "undefined" != typeof Symbol && Symbol.toPrimitive && (k.prototype[Symbol.toPrimitive] = function(t) {
        if ("number" !== t) return this.toString();
        throw new TypeError("A conversion from Temporal to a number is not allowed. To compare use the methods .equals(), .compareTo(), .isBefore() or one that is more suitable to your use case.")
    });
    var B = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t);
            var n = e.prototype;
            return n.isSupported = function(t) {
                return t instanceof R || t instanceof w ? t.isDateBased() : null != t && t.isSupportedBy(this)
            }, n.query = function(e) {
                return e === g.chronology() ? this.chronology() : e === g.precision() ? w.DAYS : e === g.localDate() ? ae.ofEpochDay(this.toEpochDay()) : e === g.localTime() || e === g.zone() || e === g.zoneId() || e === g.offset() ? null : t.prototype.query.call(this, e)
            }, n.adjustInto = function(t) {
                return t.with(R.EPOCH_DAY, this.toEpochDay())
            }, n.format = function(t) {
                return _(t, "formatter"), d(t, kt, "formatter"), t.format(this)
            }, e
        }(k),
        q = function() {
            function t() {}
            return t.startsWith = function(t, e) {
                return 0 === t.indexOf(e)
            }, t.hashCode = function(t) {
                var e = t.length;
                if (0 === e) return 0;
                for (var n = 0, i = 0; i < e; i++) {
                    n = (n << 5) - n + t.charCodeAt(i), n |= 0
                }
                return m.smi(n)
            }, t
        }(),
        Z = function() {
            function t() {}
            t.systemDefault = function() {
                throw new n("not supported operation")
            }, t.getAvailableZoneIds = function() {
                throw new n("not supported operation")
            }, t.of = function(t) {
                throw new n("not supported operation" + t)
            }, t.ofOffset = function(t, e) {
                throw new n("not supported operation" + t + e)
            }, t.from = function(t) {
                throw new n("not supported operation" + t)
            };
            var e = t.prototype;
            return e.id = function() {
                p("ZoneId.id")
            }, e.rules = function() {
                p("ZoneId.rules")
            }, e.normalized = function() {
                var t = this.rules();
                return t.isFixedOffset() ? t.offset(le.EPOCH) : this
            }, e.equals = function(e) {
                return this === e || e instanceof t && this.id() === e.id()
            }, e.hashCode = function() {
                return q.hashCode(this.id())
            }, e.toString = function() {
                return this.id()
            }, e.toJSON = function() {
                return this.toString()
            }, t
        }(),
        z = function() {
            function t() {}
            t.of = function(t) {
                return _(t, "offset"), new K(t)
            };
            var e = t.prototype;
            return e.isFixedOffset = function() {
                p("ZoneRules.isFixedOffset")
            }, e.offset = function(t) {
                return t instanceof le ? this.offsetOfInstant(t) : this.offsetOfLocalDateTime(t)
            }, e.offsetOfInstant = function(t) {
                p("ZoneRules.offsetInstant")
            }, e.offsetOfEpochMilli = function(t) {
                p("ZoneRules.offsetOfEpochMilli")
            }, e.offsetOfLocalDateTime = function(t) {
                p("ZoneRules.offsetLocalDateTime")
            }, e.validOffsets = function(t) {
                p("ZoneRules.validOffsets")
            }, e.transition = function(t) {
                p("ZoneRules.transition")
            }, e.standardOffset = function(t) {
                p("ZoneRules.standardOffset")
            }, e.daylightSavings = function(t) {
                p("ZoneRules.daylightSavings")
            }, e.isDaylightSavings = function(t) {
                p("ZoneRules.isDaylightSavings")
            }, e.isValidOffset = function(t, e) {
                p("ZoneRules.isValidOffset")
            }, e.nextTransition = function(t) {
                p("ZoneRules.nextTransition")
            }, e.previousTransition = function(t) {
                p("ZoneRules.previousTransition")
            }, e.transitions = function() {
                p("ZoneRules.transitions")
            }, e.transitionRules = function() {
                p("ZoneRules.transitionRules")
            }, e.toString = function() {
                p("ZoneRules.toString")
            }, e.toJSON = function() {
                return this.toString()
            }, t
        }(),
        K = function(t) {
            function e(e) {
                var n;
                return (n = t.call(this) || this)._offset = e, n
            }
            h(e, t);
            var n = e.prototype;
            return n.isFixedOffset = function() {
                return !0
            }, n.offsetOfInstant = function() {
                return this._offset
            }, n.offsetOfEpochMilli = function() {
                return this._offset
            }, n.offsetOfLocalDateTime = function() {
                return this._offset
            }, n.validOffsets = function() {
                return [this._offset]
            }, n.transition = function() {
                return null
            }, n.standardOffset = function() {
                return this._offset
            }, n.daylightSavings = function() {
                return T.ZERO
            }, n.isDaylightSavings = function() {
                return !1
            }, n.isValidOffset = function(t, e) {
                return this._offset.equals(e)
            }, n.nextTransition = function() {
                return null
            }, n.previousTransition = function() {
                return null
            }, n.transitions = function() {
                return []
            }, n.transitionRules = function() {
                return []
            }, n.equals = function(t) {
                return this === t || t instanceof e && this._offset.equals(t._offset)
            }, n.toString = function() {
                return "FixedRules:" + this._offset.toString()
            }, e
        }(z),
        j = {},
        G = {},
        X = function(t) {
            function e(n) {
                var i;
                return i = t.call(this) || this, e._validateTotalSeconds(n), i._totalSeconds = m.safeToInt(n), i._rules = z.of(c(i)), i._id = e._buildId(n), i
            }
            h(e, t);
            var i = e.prototype;
            return i.totalSeconds = function() {
                return this._totalSeconds
            }, i.id = function() {
                return this._id
            }, e._buildId = function(t) {
                if (0 === t) return "Z";
                var e = Math.abs(t),
                    n = m.intDiv(e, fe.SECONDS_PER_HOUR),
                    i = m.intMod(m.intDiv(e, fe.SECONDS_PER_MINUTE), fe.MINUTES_PER_HOUR),
                    r = (t < 0 ? "-" : "+") + (n < 10 ? "0" : "") + n + (i < 10 ? ":0" : ":") + i,
                    s = m.intMod(e, fe.SECONDS_PER_MINUTE);
                return 0 !== s && (r += (s < 10 ? ":0" : ":") + s), r
            }, e._validateTotalSeconds = function(t) {
                if (Math.abs(t) > e.MAX_SECONDS) throw new n("Zone offset not in valid range: -18:00 to +18:00")
            }, e._validate = function(t, e, i) {
                if (t < -18 || t > 18) throw new n("Zone offset hours not in valid range: value " + t + " is not in the range -18 to 18");
                if (t > 0) {
                    if (e < 0 || i < 0) throw new n("Zone offset minutes and seconds must be positive because hours is positive")
                } else if (t < 0) {
                    if (e > 0 || i > 0) throw new n("Zone offset minutes and seconds must be negative because hours is negative")
                } else if (e > 0 && i < 0 || e < 0 && i > 0) throw new n("Zone offset minutes and seconds must have the same sign");
                if (Math.abs(e) > 59) throw new n("Zone offset minutes not in valid range: abs(value) " + Math.abs(e) + " is not in the range 0 to 59");
                if (Math.abs(i) > 59) throw new n("Zone offset seconds not in valid range: abs(value) " + Math.abs(i) + " is not in the range 0 to 59");
                if (18 === Math.abs(t) && (Math.abs(e) > 0 || Math.abs(i) > 0)) throw new n("Zone offset not in valid range: -18:00 to +18:00")
            }, e.of = function(t) {
                _(t, "offsetId");
                var i, r, s, o = G[t];
                if (null != o) return o;
                switch (t.length) {
                    case 2:
                        t = t[0] + "0" + t[1];
                    case 3:
                        i = e._parseNumber(t, 1, !1), r = 0, s = 0;
                        break;
                    case 5:
                        i = e._parseNumber(t, 1, !1), r = e._parseNumber(t, 3, !1), s = 0;
                        break;
                    case 6:
                        i = e._parseNumber(t, 1, !1), r = e._parseNumber(t, 4, !0), s = 0;
                        break;
                    case 7:
                        i = e._parseNumber(t, 1, !1), r = e._parseNumber(t, 3, !1), s = e._parseNumber(t, 5, !1);
                        break;
                    case 9:
                        i = e._parseNumber(t, 1, !1), r = e._parseNumber(t, 4, !0), s = e._parseNumber(t, 7, !0);
                        break;
                    default:
                        throw new n("Invalid ID for ZoneOffset, invalid format: " + t)
                }
                var a = t[0];
                if ("+" !== a && "-" !== a) throw new n("Invalid ID for ZoneOffset, plus/minus not found when expected: " + t);
                return "-" === a ? e.ofHoursMinutesSeconds(-i, -r, -s) : e.ofHoursMinutesSeconds(i, r, s)
            }, e._parseNumber = function(t, e, i) {
                if (i && ":" !== t[e - 1]) throw new n("Invalid ID for ZoneOffset, colon not found when expected: " + t);
                var r = t[e],
                    s = t[e + 1];
                if (r < "0" || r > "9" || s < "0" || s > "9") throw new n("Invalid ID for ZoneOffset, non numeric characters found: " + t);
                return 10 * (r.charCodeAt(0) - 48) + (s.charCodeAt(0) - 48)
            }, e.ofHours = function(t) {
                return e.ofHoursMinutesSeconds(t, 0, 0)
            }, e.ofHoursMinutes = function(t, n) {
                return e.ofHoursMinutesSeconds(t, n, 0)
            }, e.ofHoursMinutesSeconds = function(t, n, i) {
                e._validate(t, n, i);
                var r = t * fe.SECONDS_PER_HOUR + n * fe.SECONDS_PER_MINUTE + i;
                return e.ofTotalSeconds(r)
            }, e.ofTotalMinutes = function(t) {
                var n = t * fe.SECONDS_PER_MINUTE;
                return e.ofTotalSeconds(n)
            }, e.ofTotalSeconds = function(t) {
                if (t % (15 * fe.SECONDS_PER_MINUTE) == 0) {
                    var n = t,
                        i = j[n];
                    return null == i && (i = new e(t), j[n] = i, G[i.id()] = i), i
                }
                return new e(t)
            }, i.rules = function() {
                return this._rules
            }, i.get = function(t) {
                return this.getLong(t)
            }, i.getLong = function(t) {
                if (t === R.OFFSET_SECONDS) return this._totalSeconds;
                if (t instanceof R) throw new n("Unsupported field: " + t);
                return t.getFrom(this)
            }, i.query = function(t) {
                return _(t, "query"), t === g.offset() || t === g.zone() ? this : t === g.localDate() || t === g.localTime() || t === g.precision() || t === g.chronology() || t === g.zoneId() ? null : t.queryFrom(this)
            }, i.adjustInto = function(t) {
                return t.with(R.OFFSET_SECONDS, this._totalSeconds)
            }, i.compareTo = function(t) {
                return _(t, "other"), t._totalSeconds - this._totalSeconds
            }, i.equals = function(t) {
                return this === t || t instanceof e && this._totalSeconds === t._totalSeconds
            }, i.hashCode = function() {
                return this._totalSeconds
            }, i.toString = function() {
                return this._id
            }, e
        }(Z);
    var J = function(t) {
            function e() {
                var e;
                return (e = t.call(this) || this).fieldValues = new W, e.chrono = null, e.zone = null, e.date = null, e.time = null, e.leapSecond = !1, e.excessDays = null, e
            }
            h(e, t), e.create = function(t, n) {
                var i = new e;
                return i._addFieldValue(t, n), i
            };
            var i = e.prototype;
            return i.getFieldValue0 = function(t) {
                return this.fieldValues.get(t)
            }, i._addFieldValue = function(t, e) {
                _(t, "field");
                var i = this.getFieldValue0(t);
                if (null != i && i !== e) throw new n("Conflict found: " + t + " " + i + " differs from " + t + " " + e + ": " + this);
                return this._putFieldValue0(t, e)
            }, i._putFieldValue0 = function(t, e) {
                return this.fieldValues.put(t, e), this
            }, i.resolve = function(t, e) {
                return null != e && this.fieldValues.retainAll(e), this._mergeDate(t), this._mergeTime(t), this._resolveTimeInferZeroes(t), null != this.excessDays && !1 === this.excessDays.isZero() && null != this.date && null != this.time && (this.date = this.date.plus(this.excessDays), this.excessDays = b.ZERO), this._resolveInstant(), this
            }, i._mergeDate = function(t) {
                this._checkDate(te.INSTANCE.resolveDate(this.fieldValues, t))
            }, i._checkDate = function(t) {
                if (null != t)
                    for (var e in this._addObject(t), this.fieldValues.keySet()) {
                        var i = R.byName(e);
                        if (i && void 0 !== this.fieldValues.get(i) && i.isDateBased()) {
                            var r = void 0;
                            try {
                                r = t.getLong(i)
                            } catch (t) {
                                if (t instanceof n) continue;
                                throw t
                            }
                            var s = this.fieldValues.get(i);
                            if (r !== s) throw new n("Conflict found: Field " + i + " " + r + " differs from " + i + " " + s + " derived from " + t)
                        }
                    }
            }, i._mergeTime = function(t) {
                if (this.fieldValues.containsKey(R.CLOCK_HOUR_OF_DAY)) {
                    var e = this.fieldValues.remove(R.CLOCK_HOUR_OF_DAY);
                    t !== x.LENIENT && (t === x.SMART && 0 === e || R.CLOCK_HOUR_OF_DAY.checkValidValue(e)), this._addFieldValue(R.HOUR_OF_DAY, 24 === e ? 0 : e)
                }
                if (this.fieldValues.containsKey(R.CLOCK_HOUR_OF_AMPM)) {
                    var n = this.fieldValues.remove(R.CLOCK_HOUR_OF_AMPM);
                    t !== x.LENIENT && (t === x.SMART && 0 === n || R.CLOCK_HOUR_OF_AMPM.checkValidValue(n)), this._addFieldValue(R.HOUR_OF_AMPM, 12 === n ? 0 : n)
                }
                if (t !== x.LENIENT && (this.fieldValues.containsKey(R.AMPM_OF_DAY) && R.AMPM_OF_DAY.checkValidValue(this.fieldValues.get(R.AMPM_OF_DAY)), this.fieldValues.containsKey(R.HOUR_OF_AMPM) && R.HOUR_OF_AMPM.checkValidValue(this.fieldValues.get(R.HOUR_OF_AMPM))), this.fieldValues.containsKey(R.AMPM_OF_DAY) && this.fieldValues.containsKey(R.HOUR_OF_AMPM)) {
                    var i = this.fieldValues.remove(R.AMPM_OF_DAY),
                        r = this.fieldValues.remove(R.HOUR_OF_AMPM);
                    this._addFieldValue(R.HOUR_OF_DAY, 12 * i + r)
                }
                if (this.fieldValues.containsKey(R.NANO_OF_DAY)) {
                    var s = this.fieldValues.remove(R.NANO_OF_DAY);
                    t !== x.LENIENT && R.NANO_OF_DAY.checkValidValue(s), this._addFieldValue(R.SECOND_OF_DAY, m.intDiv(s, 1e9)), this._addFieldValue(R.NANO_OF_SECOND, m.intMod(s, 1e9))
                }
                if (this.fieldValues.containsKey(R.MICRO_OF_DAY)) {
                    var o = this.fieldValues.remove(R.MICRO_OF_DAY);
                    t !== x.LENIENT && R.MICRO_OF_DAY.checkValidValue(o), this._addFieldValue(R.SECOND_OF_DAY, m.intDiv(o, 1e6)), this._addFieldValue(R.MICRO_OF_SECOND, m.intMod(o, 1e6))
                }
                if (this.fieldValues.containsKey(R.MILLI_OF_DAY)) {
                    var a = this.fieldValues.remove(R.MILLI_OF_DAY);
                    t !== x.LENIENT && R.MILLI_OF_DAY.checkValidValue(a), this._addFieldValue(R.SECOND_OF_DAY, m.intDiv(a, 1e3)), this._addFieldValue(R.MILLI_OF_SECOND, m.intMod(a, 1e3))
                }
                if (this.fieldValues.containsKey(R.SECOND_OF_DAY)) {
                    var u = this.fieldValues.remove(R.SECOND_OF_DAY);
                    t !== x.LENIENT && R.SECOND_OF_DAY.checkValidValue(u), this._addFieldValue(R.HOUR_OF_DAY, m.intDiv(u, 3600)), this._addFieldValue(R.MINUTE_OF_HOUR, m.intMod(m.intDiv(u, 60), 60)), this._addFieldValue(R.SECOND_OF_MINUTE, m.intMod(u, 60))
                }
                if (this.fieldValues.containsKey(R.MINUTE_OF_DAY)) {
                    var h = this.fieldValues.remove(R.MINUTE_OF_DAY);
                    t !== x.LENIENT && R.MINUTE_OF_DAY.checkValidValue(h), this._addFieldValue(R.HOUR_OF_DAY, m.intDiv(h, 60)), this._addFieldValue(R.MINUTE_OF_HOUR, m.intMod(h, 60))
                }
                if (t !== x.LENIENT && (this.fieldValues.containsKey(R.MILLI_OF_SECOND) && R.MILLI_OF_SECOND.checkValidValue(this.fieldValues.get(R.MILLI_OF_SECOND)), this.fieldValues.containsKey(R.MICRO_OF_SECOND) && R.MICRO_OF_SECOND.checkValidValue(this.fieldValues.get(R.MICRO_OF_SECOND))), this.fieldValues.containsKey(R.MILLI_OF_SECOND) && this.fieldValues.containsKey(R.MICRO_OF_SECOND)) {
                    var f = this.fieldValues.remove(R.MILLI_OF_SECOND),
                        c = this.fieldValues.get(R.MICRO_OF_SECOND);
                    this._putFieldValue0(R.MICRO_OF_SECOND, 1e3 * f + m.intMod(c, 1e3))
                }
                if (this.fieldValues.containsKey(R.MICRO_OF_SECOND) && this.fieldValues.containsKey(R.NANO_OF_SECOND)) {
                    var l = this.fieldValues.get(R.NANO_OF_SECOND);
                    this._putFieldValue0(R.MICRO_OF_SECOND, m.intDiv(l, 1e3)), this.fieldValues.remove(R.MICRO_OF_SECOND)
                }
                if (this.fieldValues.containsKey(R.MILLI_OF_SECOND) && this.fieldValues.containsKey(R.NANO_OF_SECOND)) {
                    var _ = this.fieldValues.get(R.NANO_OF_SECOND);
                    this._putFieldValue0(R.MILLI_OF_SECOND, m.intDiv(_, 1e6)), this.fieldValues.remove(R.MILLI_OF_SECOND)
                }
                if (this.fieldValues.containsKey(R.MICRO_OF_SECOND)) {
                    var d = this.fieldValues.remove(R.MICRO_OF_SECOND);
                    this._putFieldValue0(R.NANO_OF_SECOND, 1e3 * d)
                } else if (this.fieldValues.containsKey(R.MILLI_OF_SECOND)) {
                    var p = this.fieldValues.remove(R.MILLI_OF_SECOND);
                    this._putFieldValue0(R.NANO_OF_SECOND, 1e6 * p)
                }
            }, i._resolveTimeInferZeroes = function(t) {
                var e = this.fieldValues.get(R.HOUR_OF_DAY),
                    n = this.fieldValues.get(R.MINUTE_OF_HOUR),
                    i = this.fieldValues.get(R.SECOND_OF_MINUTE),
                    r = this.fieldValues.get(R.NANO_OF_SECOND);
                if (null != e && (null != n || null == i && null == r) && (null == n || null != i || null == r)) {
                    if (t !== x.LENIENT) {
                        if (null != e) {
                            t !== x.SMART || 24 !== e || null != n && 0 !== n || null != i && 0 !== i || null != r && 0 !== r || (e = 0, this.excessDays = b.ofDays(1));
                            var s = R.HOUR_OF_DAY.checkValidIntValue(e);
                            if (null != n) {
                                var o = R.MINUTE_OF_HOUR.checkValidIntValue(n);
                                if (null != i) {
                                    var a = R.SECOND_OF_MINUTE.checkValidIntValue(i);
                                    if (null != r) {
                                        var u = R.NANO_OF_SECOND.checkValidIntValue(r);
                                        this._addObject(fe.of(s, o, a, u))
                                    } else this._addObject(fe.of(s, o, a))
                                } else null == r && this._addObject(fe.of(s, o))
                            } else null == i && null == r && this._addObject(fe.of(s, 0))
                        }
                    } else if (null != e) {
                        var h = e;
                        if (null != n)
                            if (null != i) {
                                null == r && (r = 0);
                                var f = m.safeMultiply(h, 36e11);
                                f = m.safeAdd(f, m.safeMultiply(n, 6e10)), f = m.safeAdd(f, m.safeMultiply(i, 1e9)), f = m.safeAdd(f, r);
                                var c = m.floorDiv(f, 864e11),
                                    l = m.floorMod(f, 864e11);
                                this._addObject(fe.ofNanoOfDay(l)), this.excessDays = b.ofDays(c)
                            } else {
                                var _ = m.safeMultiply(h, 3600);
                                _ = m.safeAdd(_, m.safeMultiply(n, 60));
                                var d = m.floorDiv(_, 86400),
                                    p = m.floorMod(_, 86400);
                                this._addObject(fe.ofSecondOfDay(p)), this.excessDays = b.ofDays(d)
                            }
                        else {
                            var O = m.safeToInt(m.floorDiv(h, 24));
                            h = m.floorMod(h, 24), this._addObject(fe.of(h, 0)), this.excessDays = b.ofDays(O)
                        }
                    }
                    this.fieldValues.remove(R.HOUR_OF_DAY), this.fieldValues.remove(R.MINUTE_OF_HOUR), this.fieldValues.remove(R.SECOND_OF_MINUTE), this.fieldValues.remove(R.NANO_OF_SECOND)
                }
            }, i._addObject = function(t) {
                t instanceof B ? this.date = t : t instanceof fe && (this.time = t)
            }, i._resolveInstant = function() {
                if (null != this.date && null != this.time) {
                    var t = this.fieldValues.get(R.OFFSET_SECONDS);
                    if (null != t) {
                        var e = X.ofTotalSeconds(t),
                            n = this.date.atTime(this.time).atZone(e).getLong(R.INSTANT_SECONDS);
                        this.fieldValues.put(R.INSTANT_SECONDS, n)
                    } else if (null != this.zone) {
                        var i = this.date.atTime(this.time).atZone(this.zone).getLong(R.INSTANT_SECONDS);
                        this.fieldValues.put(R.INSTANT_SECONDS, i)
                    }
                }
            }, i.build = function(t) {
                return t.queryFrom(this)
            }, i.isSupported = function(t) {
                return null != t && (this.fieldValues.containsKey(t) && void 0 !== this.fieldValues.get(t) || null != this.date && this.date.isSupported(t) || null != this.time && this.time.isSupported(t))
            }, i.getLong = function(t) {
                _(t, "field");
                var e = this.getFieldValue0(t);
                if (null == e) {
                    if (null != this.date && this.date.isSupported(t)) return this.date.getLong(t);
                    if (null != this.time && this.time.isSupported(t)) return this.time.getLong(t);
                    throw new n("Field not found: " + t)
                }
                return e
            }, i.query = function(t) {
                return t === g.zoneId() ? this.zone : t === g.chronology() ? this.chrono : t === g.localDate() ? null != this.date ? ae.from(this.date) : null : t === g.localTime() ? this.time : t === g.zone() || t === g.offset() ? t.queryFrom(this) : t === g.precision() ? null : t.queryFrom(this)
            }, e
        }(I),
        Q = function() {
            function t() {
                if (1 === arguments.length) {
                    if (arguments[0] instanceof t) return void this._constructorSelf.apply(this, arguments);
                    this._constructorFormatter.apply(this, arguments)
                } else this._constructorParam.apply(this, arguments);
                this._caseSensitive = !0, this._strict = !0, this._parsed = [new $(this)]
            }
            var e = t.prototype;
            return e._constructorParam = function(t, e, n) {
                this._locale = t, this._symbols = e, this._overrideChronology = n
            }, e._constructorFormatter = function(t) {
                this._locale = t.locale(), this._symbols = t.decimalStyle(), this._overrideChronology = t.chronology()
            }, e._constructorSelf = function(t) {
                this._locale = t._locale, this._symbols = t._symbols, this._overrideChronology = t._overrideChronology, this._overrideZone = t._overrideZone, this._caseSensitive = t._caseSensitive, this._strict = t._strict, this._parsed = [new $(this)]
            }, e.copy = function() {
                return new t(this)
            }, e.symbols = function() {
                return this._symbols
            }, e.isStrict = function() {
                return this._strict
            }, e.setStrict = function(t) {
                this._strict = t
            }, e.locale = function() {
                return this._locale
            }, e.setLocale = function(t) {
                this._locale = t
            }, e.startOptional = function() {
                this._parsed.push(this.currentParsed().copy())
            }, e.endOptional = function(t) {
                t ? this._parsed.splice(this._parsed.length - 2, 1) : this._parsed.splice(this._parsed.length - 1, 1)
            }, e.isCaseSensitive = function() {
                return this._caseSensitive
            }, e.setCaseSensitive = function(t) {
                this._caseSensitive = t
            }, e.subSequenceEquals = function(t, e, n, i, r) {
                if (e + r > t.length || i + r > n.length) return !1;
                this.isCaseSensitive() || (t = t.toLowerCase(), n = n.toLowerCase());
                for (var s = 0; s < r; s++) {
                    if (t[e + s] !== n[i + s]) return !1
                }
                return !0
            }, e.charEquals = function(t, e) {
                return this.isCaseSensitive() ? t === e : this.charEqualsIgnoreCase(t, e)
            }, e.charEqualsIgnoreCase = function(t, e) {
                return t === e || t.toLowerCase() === e.toLowerCase()
            }, e.setParsedField = function(t, e, n, i) {
                var r = this.currentParsed().fieldValues,
                    s = r.get(t);
                return r.set(t, e), null != s && s !== e ? ~n : i
            }, e.setParsedZone = function(t) {
                _(t, "zone"), this.currentParsed().zone = t
            }, e.getParsed = function(t) {
                return this.currentParsed().fieldValues.get(t)
            }, e.toParsed = function() {
                return this.currentParsed()
            }, e.currentParsed = function() {
                return this._parsed[this._parsed.length - 1]
            }, e.setParsedLeapSecond = function() {
                this.currentParsed().leapSecond = !0
            }, e.getEffectiveChronology = function() {
                var t = this.currentParsed().chrono;
                return null == t && null == (t = this._overrideChronology) && (t = te.INSTANCE), t
            }, t
        }(),
        $ = function(t) {
            function e(e) {
                var n;
                return (n = t.call(this) || this).chrono = null, n.zone = null, n.fieldValues = new W, n.leapSecond = !1, n.dateTimeParseContext = e, n
            }
            h(e, t);
            var n = e.prototype;
            return n.copy = function() {
                var t = new e;
                return t.chrono = this.chrono, t.zone = this.zone, t.fieldValues.putAll(this.fieldValues), t.leapSecond = this.leapSecond, t.dateTimeParseContext = this.dateTimeParseContext, t
            }, n.toString = function() {
                return this.fieldValues + ", " + this.chrono + ", " + this.zone
            }, n.isSupported = function(t) {
                return this.fieldValues.containsKey(t)
            }, n.get = function(t) {
                var e = this.fieldValues.get(t);
                return l(null != e), e
            }, n.query = function(e) {
                return e === g.chronology() ? this.chrono : e === g.zoneId() || e === g.zone() ? this.zone : t.prototype.query.call(this, e)
            }, n.toBuilder = function() {
                var t = new J;
                return t.fieldValues.putAll(this.fieldValues), t.chrono = this.dateTimeParseContext.getEffectiveChronology(), null != this.zone ? t.zone = this.zone : t.zone = this.overrideZone, t.leapSecond = this.leapSecond, t.excessDays = this.excessDays, t
            }, e
        }(k),
        tt = function() {
            function t(e, n, i) {
                2 === arguments.length && arguments[1] instanceof kt ? (this._temporal = t.adjust(e, n), this._locale = n.locale(), this._symbols = n.decimalStyle()) : (this._temporal = e, this._locale = n, this._symbols = i), this._optional = 0
            }
            t.adjust = function(t, e) {
                return t
            };
            var e = t.prototype;
            return e.symbols = function() {
                return this._symbols
            }, e.startOptional = function() {
                this._optional++
            }, e.endOptional = function() {
                this._optional--
            }, e.getValueQuery = function(t) {
                var e = this._temporal.query(t);
                if (null == e && 0 === this._optional) throw new n("Unable to extract value: " + this._temporal);
                return e
            }, e.getValue = function(t) {
                try {
                    return this._temporal.getLong(t)
                } catch (t) {
                    if (t instanceof n && this._optional > 0) return null;
                    throw t
                }
            }, e.temporal = function() {
                return this._temporal
            }, e.locale = function() {
                return this._locale
            }, e.setDateTime = function(t) {
                this._temporal = t
            }, e.setLocale = function(t) {
                this._locale = t
            }, t
        }(),
        et = {},
        nt = [0, 90, 181, 273, 0, 91, 182, 274],
        it = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t);
            var n = e.prototype;
            return n.isDateBased = function() {
                return !0
            }, n.isTimeBased = function() {
                return !1
            }, n._isIso = function() {
                return !0
            }, e._getWeekRangeByLocalDate = function(t) {
                var n = e._getWeekBasedYear(t);
                return M.of(1, e._getWeekRangeByYear(n))
            }, e._getWeekRangeByYear = function(t) {
                var e = ae.of(t, 1, 1);
                return e.dayOfWeek() === L.THURSDAY || e.dayOfWeek() === L.WEDNESDAY && e.isLeapYear() ? 53 : 52
            }, e._getWeek = function(t) {
                var n = t.dayOfWeek().ordinal(),
                    i = t.dayOfYear() - 1,
                    r = i + (3 - n),
                    s = r - 7 * m.intDiv(r, 7) - 3;
                if (s < -3 && (s += 7), i < s) return e._getWeekRangeByLocalDate(t.withDayOfYear(180).minusYears(1)).maximum();
                var o = m.intDiv(i - s, 7) + 1;
                return 53 === o && !1 === (-3 === s || -2 === s && t.isLeapYear()) && (o = 1), o
            }, e._getWeekBasedYear = function(t) {
                var e = t.year(),
                    n = t.dayOfYear();
                if (n <= 3) n - t.dayOfWeek().ordinal() < -2 && e--;
                else if (n >= 363) {
                    var i = t.dayOfWeek().ordinal();
                    (n = n - 363 - (t.isLeapYear() ? 1 : 0)) - i >= 0 && e++
                }
                return e
            }, n.displayName = function() {
                return this.toString()
            }, n.resolve = function() {
                return null
            }, n.name = function() {
                return this.toString()
            }, e
        }(y),
        rt = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t);
            var n = e.prototype;
            return n.toString = function() {
                return "DayOfQuarter"
            }, n.baseUnit = function() {
                return w.DAYS
            }, n.rangeUnit = function() {
                return dt
            }, n.range = function() {
                return M.of(1, 90, 92)
            }, n.isSupportedBy = function(t) {
                return t.isSupported(R.DAY_OF_YEAR) && t.isSupported(R.MONTH_OF_YEAR) && t.isSupported(R.YEAR) && this._isIso(t)
            }, n.rangeRefinedBy = function(t) {
                if (!1 === t.isSupported(this)) throw new r("Unsupported field: DayOfQuarter");
                var e = t.getLong(ft);
                if (1 === e) {
                    var n = t.getLong(R.YEAR);
                    return te.isLeapYear(n) ? M.of(1, 91) : M.of(1, 90)
                }
                return 2 === e ? M.of(1, 91) : 3 === e || 4 === e ? M.of(1, 92) : this.range()
            }, n.getFrom = function(t) {
                if (!1 === t.isSupported(this)) throw new r("Unsupported field: DayOfQuarter");
                var e = t.get(R.DAY_OF_YEAR),
                    n = t.get(R.MONTH_OF_YEAR),
                    i = t.getLong(R.YEAR);
                return e - nt[m.intDiv(n - 1, 3) + (te.isLeapYear(i) ? 4 : 0)]
            }, n.adjustInto = function(t, e) {
                var n = this.getFrom(t);
                return this.range().checkValidValue(e, this), t.with(R.DAY_OF_YEAR, t.getLong(R.DAY_OF_YEAR) + (e - n))
            }, n.resolve = function(t, e, n) {
                var i = t.get(R.YEAR),
                    r = t.get(ft);
                if (null == i || null == r) return null;
                var s, o = R.YEAR.checkValidIntValue(i),
                    a = t.get(ht);
                if (n === x.LENIENT) {
                    var u = r;
                    s = (s = (s = ae.of(o, 1, 1)).plusMonths(m.safeMultiply(m.safeSubtract(u, 1), 3))).plusDays(m.safeSubtract(a, 1))
                } else {
                    var h = ft.range().checkValidIntValue(r, ft);
                    if (n === x.STRICT) {
                        var f = 92;
                        1 === h ? f = te.isLeapYear(o) ? 91 : 90 : 2 === h && (f = 91), M.of(1, f).checkValidValue(a, this)
                    } else this.range().checkValidValue(a, this);
                    s = ae.of(o, 3 * (h - 1) + 1, 1).plusDays(a - 1)
                }
                return t.remove(this), t.remove(R.YEAR), t.remove(ft), s
            }, e
        }(it),
        st = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t);
            var n = e.prototype;
            return n.toString = function() {
                return "QuarterOfYear"
            }, n.baseUnit = function() {
                return dt
            }, n.rangeUnit = function() {
                return w.YEARS
            }, n.range = function() {
                return M.of(1, 4)
            }, n.isSupportedBy = function(t) {
                return t.isSupported(R.MONTH_OF_YEAR) && this._isIso(t)
            }, n.rangeRefinedBy = function(t) {
                return this.range()
            }, n.getFrom = function(t) {
                if (!1 === t.isSupported(this)) throw new r("Unsupported field: QuarterOfYear");
                var e = t.getLong(R.MONTH_OF_YEAR);
                return m.intDiv(e + 2, 3)
            }, n.adjustInto = function(t, e) {
                var n = this.getFrom(t);
                return this.range().checkValidValue(e, this), t.with(R.MONTH_OF_YEAR, t.getLong(R.MONTH_OF_YEAR) + 3 * (e - n))
            }, e
        }(it),
        ot = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t);
            var n = e.prototype;
            return n.toString = function() {
                return "WeekOfWeekBasedYear"
            }, n.baseUnit = function() {
                return w.WEEKS
            }, n.rangeUnit = function() {
                return _t
            }, n.range = function() {
                return M.of(1, 52, 53)
            }, n.isSupportedBy = function(t) {
                return t.isSupported(R.EPOCH_DAY) && this._isIso(t)
            }, n.rangeRefinedBy = function(t) {
                if (!1 === t.isSupported(this)) throw new r("Unsupported field: WeekOfWeekBasedYear");
                return it._getWeekRangeByLocalDate(ae.from(t))
            }, n.getFrom = function(t) {
                if (!1 === t.isSupported(this)) throw new r("Unsupported field: WeekOfWeekBasedYear");
                return it._getWeek(ae.from(t))
            }, n.adjustInto = function(t, e) {
                return this.range().checkValidValue(e, this), t.plus(m.safeSubtract(e, this.getFrom(t)), w.WEEKS)
            }, n.resolve = function(t, e, n) {
                var i = t.get(lt),
                    r = t.get(R.DAY_OF_WEEK);
                if (null == i || null == r) return null;
                var s, o = lt.range().checkValidIntValue(i, lt),
                    a = t.get(ct);
                if (n === x.LENIENT) {
                    var u = r,
                        h = 0;
                    u > 7 ? (h = m.intDiv(u - 1, 7), u = m.intMod(u - 1, 7) + 1) : u < 1 && (h = m.intDiv(u, 7) - 1, u = m.intMod(u, 7) + 7), s = ae.of(o, 1, 4).plusWeeks(a - 1).plusWeeks(h).with(R.DAY_OF_WEEK, u)
                } else {
                    var f = R.DAY_OF_WEEK.checkValidIntValue(r);
                    if (n === x.STRICT) {
                        var c = ae.of(o, 1, 4);
                        it._getWeekRangeByLocalDate(c).checkValidValue(a, this)
                    } else this.range().checkValidValue(a, this);
                    s = ae.of(o, 1, 4).plusWeeks(a - 1).with(R.DAY_OF_WEEK, f)
                }
                return t.remove(this), t.remove(lt), t.remove(R.DAY_OF_WEEK), s
            }, n.displayName = function() {
                return "Week"
            }, e
        }(it),
        at = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t);
            var n = e.prototype;
            return n.toString = function() {
                return "WeekBasedYear"
            }, n.baseUnit = function() {
                return _t
            }, n.rangeUnit = function() {
                return w.FOREVER
            }, n.range = function() {
                return R.YEAR.range()
            }, n.isSupportedBy = function(t) {
                return t.isSupported(R.EPOCH_DAY) && this._isIso(t)
            }, n.rangeRefinedBy = function(t) {
                return R.YEAR.range()
            }, n.getFrom = function(t) {
                if (!1 === t.isSupported(this)) throw new r("Unsupported field: WeekBasedYear");
                return it._getWeekBasedYear(ae.from(t))
            }, n.adjustInto = function(t, e) {
                if (!1 === this.isSupportedBy(t)) throw new r("Unsupported field: WeekBasedYear");
                var n = this.range().checkValidIntValue(e, lt),
                    i = ae.from(t),
                    s = i.get(R.DAY_OF_WEEK),
                    o = it._getWeek(i);
                53 === o && 52 === it._getWeekRangeByYear(n) && (o = 52);
                var a = ae.of(n, 1, 4),
                    u = s - a.get(R.DAY_OF_WEEK) + 7 * (o - 1);
                return a = a.plusDays(u), t.with(a)
            }, e
        }(it),
        ut = function(t) {
            function e(e, n) {
                var i;
                return (i = t.call(this) || this)._name = e, i._duration = n, i
            }
            h(e, t);
            var n = e.prototype;
            return n.duration = function() {
                return this._duration
            }, n.isDurationEstimated = function() {
                return !0
            }, n.isDateBased = function() {
                return !0
            }, n.isTimeBased = function() {
                return !1
            }, n.isSupportedBy = function(t) {
                return t.isSupported(R.EPOCH_DAY)
            }, n.addTo = function(t, e) {
                switch (this) {
                    case _t:
                        var n = m.safeAdd(t.get(lt), e);
                        return t.with(lt, n);
                    case dt:
                        return t.plus(m.intDiv(e, 256), w.YEARS).plus(3 * m.intMod(e, 256), w.MONTHS);
                    default:
                        throw new a("Unreachable")
                }
            }, n.between = function(t, e) {
                switch (this) {
                    case _t:
                        return m.safeSubtract(e.getLong(lt), t.getLong(lt));
                    case dt:
                        return m.intDiv(t.until(e, w.MONTHS), 3);
                    default:
                        throw new a("Unreachable")
                }
            }, n.toString = function() {
                return this._name
            }, e
        }(A),
        ht = null,
        ft = null,
        ct = null,
        lt = null,
        _t = null,
        dt = null;
    var pt = function() {
        function t(t, e, n, i) {
            this._zeroDigit = t, this._zeroDigitCharCode = t.charCodeAt(0), this._positiveSign = e, this._negativeSign = n, this._decimalSeparator = i
        }
        var e = t.prototype;
        return e.positiveSign = function() {
            return this._positiveSign
        }, e.withPositiveSign = function(e) {
            return e === this._positiveSign ? this : new t(this._zeroDigit, e, this._negativeSign, this._decimalSeparator)
        }, e.negativeSign = function() {
            return this._negativeSign
        }, e.withNegativeSign = function(e) {
            return e === this._negativeSign ? this : new t(this._zeroDigit, this._positiveSign, e, this._decimalSeparator)
        }, e.zeroDigit = function() {
            return this._zeroDigit
        }, e.withZeroDigit = function(e) {
            return e === this._zeroDigit ? this : new t(e, this._positiveSign, this._negativeSign, this._decimalSeparator)
        }, e.decimalSeparator = function() {
            return this._decimalSeparator
        }, e.withDecimalSeparator = function(e) {
            return e === this._decimalSeparator ? this : new t(this._zeroDigit, this._positiveSign, this._negativeSign, e)
        }, e.convertToDigit = function(t) {
            var e = t.charCodeAt(0) - this._zeroDigitCharCode;
            return e >= 0 && e <= 9 ? e : -1
        }, e.convertNumberToI18N = function(t) {
            if ("0" === this._zeroDigit) return t;
            for (var e = this._zeroDigitCharCode - "0".charCodeAt(0), n = "", i = 0; i < t.length; i++) n += String.fromCharCode(t.charCodeAt(i) + e);
            return n
        }, e.equals = function(e) {
            return this === e || e instanceof t && (this._zeroDigit === e._zeroDigit && this._positiveSign === e._positiveSign && this._negativeSign === e._negativeSign && this._decimalSeparator === e._decimalSeparator)
        }, e.hashCode = function() {
            return this._zeroDigit + this._positiveSign + this._negativeSign + this._decimalSeparator
        }, e.toString = function() {
            return "DecimalStyle[" + this._zeroDigit + this._positiveSign + this._negativeSign + this._decimalSeparator + "]"
        }, t.of = function() {
            throw new Error("not yet supported")
        }, t.availableLocales = function() {
            throw new Error("not yet supported")
        }, t
    }();
    pt.STANDARD = new pt("0", "+", "-", ".");
    var Ot = function(t) {
        function e() {
            return t.apply(this, arguments) || this
        }
        return h(e, t), e.prototype.parse = function(t, n, i) {
            switch (this) {
                case e.NORMAL:
                    return !t || !n;
                case e.ALWAYS:
                case e.EXCEEDS_PAD:
                    return !0;
                default:
                    return !n && !i
            }
        }, e
    }(N);
    Ot.NORMAL = new Ot("NORMAL"), Ot.NEVER = new Ot("NEVER"), Ot.ALWAYS = new Ot("ALWAYS"), Ot.EXCEEDS_PAD = new Ot("EXCEEDS_PAD"), Ot.NOT_NEGATIVE = new Ot("NOT_NEGATIVE");
    var Et = function(t) {
        function e() {
            return t.apply(this, arguments) || this
        }
        h(e, t);
        var n = e.prototype;
        return n.isStandalone = function() {
            switch (this) {
                case e.FULL_STANDALONE:
                case e.SHORT_STANDALONE:
                case e.NARROW_STANDALONE:
                    return !0;
                default:
                    return !1
            }
        }, n.asStandalone = function() {
            switch (this) {
                case e.FULL:
                    return e.FULL_STANDALONE;
                case e.SHORT:
                    return e.SHORT_STANDALONE;
                case e.NARROW:
                    return e.NARROW_STANDALONE;
                default:
                    return this
            }
        }, n.asNormal = function() {
            switch (this) {
                case e.FULL_STANDALONE:
                    return e.FULL;
                case e.SHORT_STANDALONE:
                    return e.SHORT;
                case e.NARROW_STANDALONE:
                    return e.NARROW;
                default:
                    return this
            }
        }, e
    }(N);
    Et.FULL = new Et("FULL"), Et.FULL_STANDALONE = new Et("FULL_STANDALONE"), Et.SHORT = new Et("SHORT"), Et.SHORT_STANDALONE = new Et("SHORT_STANDALONE"), Et.NARROW = new Et("NARROW"), Et.NARROW_STANDALONE = new Et("NARROW_STANDALONE");
    var St = function() {
            function t(t) {
                if (t.length > 1) throw new o('invalid literal, too long: "' + t + '"');
                this._literal = t
            }
            var e = t.prototype;
            return e.print = function(t, e) {
                return e.append(this._literal), !0
            }, e.parse = function(t, e, n) {
                if (n === e.length) return ~n;
                var i = e.charAt(n);
                return !1 === t.charEquals(this._literal, i) ? ~n : n + this._literal.length
            }, e.toString = function() {
                return "'" === this._literal ? "''" : "'" + this._literal + "'"
            }, t
        }(),
        mt = function() {
            function t(t, e) {
                this._printerParsers = t, this._optional = e
            }
            var e = t.prototype;
            return e.withOptional = function(e) {
                return e === this._optional ? this : new t(this._printerParsers, e)
            }, e.print = function(t, e) {
                var n = e.length();
                this._optional && t.startOptional();
                try {
                    for (var i = 0; i < this._printerParsers.length; i++) {
                        if (!1 === this._printerParsers[i].print(t, e)) return e.setLength(n), !0
                    }
                } finally {
                    this._optional && t.endOptional()
                }
                return !0
            }, e.parse = function(t, e, n) {
                if (this._optional) {
                    t.startOptional();
                    for (var i = n, r = 0; r < this._printerParsers.length; r++) {
                        if ((i = this._printerParsers[r].parse(t, e, i)) < 0) return t.endOptional(!1), n
                    }
                    return t.endOptional(!0), i
                }
                for (var s = 0; s < this._printerParsers.length; s++) {
                    if ((n = this._printerParsers[s].parse(t, e, n)) < 0) break
                }
                return n
            }, e.toString = function() {
                var t = "";
                if (null != this._printerParsers) {
                    t += this._optional ? "[" : "(";
                    for (var e = 0; e < this._printerParsers.length; e++) {
                        t += this._printerParsers[e].toString()
                    }
                    t += this._optional ? "]" : ")"
                }
                return t
            }, t
        }(),
        Nt = function() {
            function t(t, e, n, i) {
                if (_(t, "field"), !1 === t.range().isFixed()) throw new o("Field must have a fixed set of values: " + t);
                if (e < 0 || e > 9) throw new o("Minimum width must be from 0 to 9 inclusive but was " + e);
                if (n < 1 || n > 9) throw new o("Maximum width must be from 1 to 9 inclusive but was " + n);
                if (n < e) throw new o("Maximum width must exceed or equal the minimum width but " + n + " < " + e);
                this.field = t, this.minWidth = e, this.maxWidth = n, this.decimalPoint = i
            }
            var e = t.prototype;
            return e.print = function(t, e) {
                var n = t.getValue(this.field);
                if (null === n) return !1;
                var i = t.symbols();
                if (0 === n) {
                    if (this.minWidth > 0) {
                        this.decimalPoint && e.append(i.decimalSeparator());
                        for (var r = 0; r < this.minWidth; r++) e.append(i.zeroDigit())
                    }
                } else {
                    var s = this.convertToFraction(n, i.zeroDigit()),
                        o = Math.min(Math.max(s.length, this.minWidth), this.maxWidth);
                    if (1 * (s = s.substr(0, o)) > 0)
                        for (; s.length > this.minWidth && "0" === s[s.length - 1];) s = s.substr(0, s.length - 1);
                    var a = s;
                    a = i.convertNumberToI18N(a), this.decimalPoint && e.append(i.decimalSeparator()), e.append(a)
                }
                return !0
            }, e.parse = function(t, e, n) {
                var i = t.isStrict() ? this.minWidth : 0,
                    r = t.isStrict() ? this.maxWidth : 9,
                    s = e.length;
                if (n === s) return i > 0 ? ~n : n;
                if (this.decimalPoint) {
                    if (e[n] !== t.symbols().decimalSeparator()) return i > 0 ? ~n : n;
                    n++
                }
                var o = n + i;
                if (o > s) return ~n;
                for (var a = Math.min(n + r, s), u = 0, h = n; h < a;) {
                    var f = e.charAt(h++),
                        c = t.symbols().convertToDigit(f);
                    if (c < 0) {
                        if (h < o) return ~n;
                        h--;
                        break
                    }
                    u = 10 * u + c
                }
                var l = h - n,
                    _ = Math.pow(10, l),
                    d = this.convertFromFraction(u, _);
                return t.setParsedField(this.field, d, n, h)
            }, e.convertToFraction = function(t, e) {
                var n = this.field.range();
                n.checkValidValue(t, this.field);
                for (var i = n.minimum(), r = n.maximum() - i + 1, s = t - i, o = "" + m.intDiv(1e9 * s, r); o.length < 9;) o = e + o;
                return o
            }, e.convertFromFraction = function(t, e) {
                var n = this.field.range(),
                    i = n.minimum(),
                    r = n.maximum() - i + 1;
                return m.intDiv(t * r, e)
            }, e.toString = function() {
                var t = this.decimalPoint ? ",DecimalPoint" : "";
                return "Fraction(" + this.field + "," + this.minWidth + "," + this.maxWidth + t + ")"
            }, t
        }(),
        Dt = [0, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9],
        At = function() {
            function t(t, e, n, i, r) {
                void 0 === r && (r = 0), this._field = t, this._minWidth = e, this._maxWidth = n, this._signStyle = i, this._subsequentWidth = r
            }
            var e = t.prototype;
            return e.field = function() {
                return this._field
            }, e.minWidth = function() {
                return this._minWidth
            }, e.maxWidth = function() {
                return this._maxWidth
            }, e.signStyle = function() {
                return this._signStyle
            }, e.withFixedWidth = function() {
                return -1 === this._subsequentWidth ? this : new t(this._field, this._minWidth, this._maxWidth, this._signStyle, -1)
            }, e.withSubsequentWidth = function(e) {
                return new t(this._field, this._minWidth, this._maxWidth, this._signStyle, this._subsequentWidth + e)
            }, e._isFixedWidth = function() {
                return -1 === this._subsequentWidth || this._subsequentWidth > 0 && this._minWidth === this._maxWidth && this._signStyle === Ot.NOT_NEGATIVE
            }, e.print = function(t, e) {
                var i = t.getValue(this._field);
                if (null == i) return !1;
                var r = this._getValue(t, i),
                    s = t.symbols(),
                    o = "" + Math.abs(r);
                if (o.length > this._maxWidth) throw new n("Field " + this._field + " cannot be printed as the value " + r + " exceeds the maximum print width of " + this._maxWidth);
                if (o = s.convertNumberToI18N(o), r >= 0) switch (this._signStyle) {
                    case Ot.EXCEEDS_PAD:
                        this._minWidth < 15 && r >= Dt[this._minWidth] && e.append(s.positiveSign());
                        break;
                    case Ot.ALWAYS:
                        e.append(s.positiveSign())
                } else switch (this._signStyle) {
                    case Ot.NORMAL:
                    case Ot.EXCEEDS_PAD:
                    case Ot.ALWAYS:
                        e.append(s.negativeSign());
                        break;
                    case Ot.NOT_NEGATIVE:
                        throw new n("Field " + this._field + " cannot be printed as the value " + r + " cannot be negative according to the SignStyle")
                }
                for (var a = 0; a < this._minWidth - o.length; a++) e.append(s.zeroDigit());
                return e.append(o), !0
            }, e.parse = function(t, e, n) {
                var i = e.length;
                if (n === i) return ~n;
                l(n >= 0 && n < i);
                var r = e.charAt(n),
                    o = !1,
                    a = !1;
                if (r === t.symbols().positiveSign()) {
                    if (!1 === this._signStyle.parse(!0, t.isStrict(), this._minWidth === this._maxWidth)) return ~n;
                    a = !0, n++
                } else if (r === t.symbols().negativeSign()) {
                    if (!1 === this._signStyle.parse(!1, t.isStrict(), this._minWidth === this._maxWidth)) return ~n;
                    o = !0, n++
                } else if (this._signStyle === Ot.ALWAYS && t.isStrict()) return ~n;
                var u = t.isStrict() || this._isFixedWidth() ? this._minWidth : 1,
                    h = n + u;
                if (h > i) return ~n;
                for (var f = (t.isStrict() || this._isFixedWidth() ? this._maxWidth : 9) + Math.max(this._subsequentWidth, 0), c = 0, _ = n, d = 0; d < 2; d++) {
                    for (var p = Math.min(_ + f, i); _ < p;) {
                        var O = e.charAt(_++),
                            E = t.symbols().convertToDigit(O);
                        if (E < 0) {
                            if (--_ < h) return ~n;
                            break
                        }
                        if (_ - n > 15) throw new s("number text exceeds length");
                        c = 10 * c + E
                    }
                    if (!(this._subsequentWidth > 0 && 0 === d)) break;
                    var S = _ - n;
                    f = Math.max(u, S - this._subsequentWidth), _ = n, c = 0
                }
                if (o) {
                    if (0 === c && t.isStrict()) return ~(n - 1);
                    0 !== c && (c = -c)
                } else if (this._signStyle === Ot.EXCEEDS_PAD && t.isStrict()) {
                    var m = _ - n;
                    if (a) {
                        if (m <= this._minWidth) return ~(n - 1)
                    } else if (m > this._minWidth) return ~n
                }
                return this._setValue(t, c, n, _)
            }, e._getValue = function(t, e) {
                return e
            }, e._setValue = function(t, e, n, i) {
                return t.setParsedField(this._field, e, n, i)
            }, e.toString = function() {
                return 1 === this._minWidth && 15 === this._maxWidth && this._signStyle === Ot.NORMAL ? "Value(" + this._field + ")" : this._minWidth === this._maxWidth && this._signStyle === Ot.NOT_NEGATIVE ? "Value(" + this._field + "," + this._minWidth + ")" : "Value(" + this._field + "," + this._minWidth + "," + this._maxWidth + "," + this._signStyle + ")"
            }, t
        }(),
        Tt = function(t) {
            function e(e, i, r, s, a) {
                var u;
                if (u = t.call(this, e, i, r, Ot.NOT_NEGATIVE) || this, i < 1 || i > 10) throw new o("The width must be from 1 to 10 inclusive but was " + i);
                if (r < 1 || r > 10) throw new o("The maxWidth must be from 1 to 10 inclusive but was " + r);
                if (r < i) throw new o("The maxWidth must be greater than the width");
                if (null === a) {
                    if (!1 === e.range().isValidValue(s)) throw new o("The base value must be within the range of the field");
                    if (s + Dt[i] > m.MAX_SAFE_INTEGER) throw new n("Unable to add printer-parser as the range exceeds the capacity of an int")
                }
                return u._baseValue = s, u._baseDate = a, u
            }
            h(e, t);
            var i = e.prototype;
            return i._getValue = function(t, e) {
                var n = Math.abs(e),
                    i = this._baseValue;
                null !== this._baseDate && (t.temporal(), i = te.INSTANCE.date(this._baseDate).get(this._field));
                return e >= i && e < i + Dt[this._minWidth] ? n % Dt[this._minWidth] : n % Dt[this._maxWidth]
            }, i._setValue = function(t, e, n, i) {
                var r = this._baseValue;
                null != this._baseDate && (r = t.getEffectiveChronology().date(this._baseDate).get(this._field));
                if (i - n === this._minWidth && e >= 0) {
                    var s = Dt[this._minWidth],
                        o = r - r % s;
                    (e = r > 0 ? o + e : o - e) < r && (e += s)
                }
                return t.setParsedField(this._field, e, n, i)
            }, i.withFixedWidth = function() {
                return -1 === this._subsequentWidth ? this : new e(this._field, this._minWidth, this._maxWidth, this._baseValue, this._baseDate)
            }, i.withSubsequentWidth = function(t) {
                return new e(this._field, this._minWidth, this._maxWidth, this._baseValue, this._baseDate, this._subsequentWidth + t)
            }, i.isFixedWidth = function(e) {
                return !1 !== e.isStrict() && t.prototype.isFixedWidth.call(this, e)
            }, i.toString = function() {
                return "ReducedValue(" + this._field + "," + this._minWidth + "," + this._maxWidth + "," + (null != this._baseDate ? this._baseDate : this._baseValue) + ")"
            }, e
        }(At),
        vt = ["+HH", "+HHmm", "+HH:mm", "+HHMM", "+HH:MM", "+HHMMss", "+HH:MM:ss", "+HHMMSS", "+HH:MM:SS"],
        wt = function() {
            function t(t, e) {
                _(t, "noOffsetText"), _(e, "pattern"), this.noOffsetText = t, this.type = this._checkPattern(e)
            }
            var e = t.prototype;
            return e._checkPattern = function(t) {
                for (var e = 0; e < vt.length; e++)
                    if (vt[e] === t) return e;
                throw new o("Invalid zone offset pattern: " + t)
            }, e.print = function(t, e) {
                var n = t.getValue(R.OFFSET_SECONDS);
                if (null == n) return !1;
                var i = m.safeToInt(n);
                if (0 === i) e.append(this.noOffsetText);
                else {
                    var r = Math.abs(m.intMod(m.intDiv(i, 3600), 100)),
                        s = Math.abs(m.intMod(m.intDiv(i, 60), 60)),
                        o = Math.abs(m.intMod(i, 60)),
                        a = e.length(),
                        u = r;
                    e.append(i < 0 ? "-" : "+").appendChar(m.intDiv(r, 10) + "0").appendChar(m.intMod(r, 10) + "0"), (this.type >= 3 || this.type >= 1 && s > 0) && (e.append(this.type % 2 == 0 ? ":" : "").appendChar(m.intDiv(s, 10) + "0").appendChar(s % 10 + "0"), u += s, (this.type >= 7 || this.type >= 5 && o > 0) && (e.append(this.type % 2 == 0 ? ":" : "").appendChar(m.intDiv(o, 10) + "0").appendChar(o % 10 + "0"), u += o)), 0 === u && (e.setLength(a), e.append(this.noOffsetText))
                }
                return !0
            }, e.parse = function(t, e, n) {
                var i = e.length,
                    r = this.noOffsetText.length;
                if (0 === r) {
                    if (n === i) return t.setParsedField(R.OFFSET_SECONDS, 0, n, n)
                } else {
                    if (n === i) return ~n;
                    if (t.subSequenceEquals(e, n, this.noOffsetText, 0, r)) return t.setParsedField(R.OFFSET_SECONDS, 0, n, n + r)
                }
                var s = e[n];
                if ("+" === s || "-" === s) {
                    var o = "-" === s ? -1 : 1,
                        a = [0, 0, 0, 0];
                    if (a[0] = n + 1, !1 === (this._parseNumber(a, 1, e, !0) || this._parseNumber(a, 2, e, this.type >= 3) || this._parseNumber(a, 3, e, !1))) {
                        var u = m.safeZero(o * (3600 * a[1] + 60 * a[2] + a[3]));
                        return t.setParsedField(R.OFFSET_SECONDS, u, n, a[0])
                    }
                }
                return 0 === r ? t.setParsedField(R.OFFSET_SECONDS, 0, n, n + r) : ~n
            }, e._parseNumber = function(t, e, n, i) {
                if ((this.type + 3) / 2 < e) return !1;
                var r = t[0];
                if (this.type % 2 == 0 && e > 1) {
                    if (r + 1 > n.length || ":" !== n[r]) return i;
                    r++
                }
                if (r + 2 > n.length) return i;
                var s = n[r++],
                    o = n[r++];
                if (s < "0" || s > "9" || o < "0" || o > "9") return i;
                var a = 10 * (s.charCodeAt(0) - 48) + (o.charCodeAt(0) - 48);
                return a < 0 || a > 59 ? i : (t[e] = a, t[0] = r, !1)
            }, e.toString = function() {
                var t = this.noOffsetText.replace("'", "''");
                return "Offset(" + vt[this.type] + ",'" + t + "')"
            }, t
        }();
    wt.INSTANCE_ID = new wt("Z", "+HH:MM:ss"), wt.PATTERNS = vt;
    var yt = function() {
            function t(t, e, n) {
                this._printerParser = t, this._padWidth = e, this._padChar = n
            }
            var e = t.prototype;
            return e.print = function(t, e) {
                var i = e.length();
                if (!1 === this._printerParser.print(t, e)) return !1;
                var r = e.length() - i;
                if (r > this._padWidth) throw new n("Cannot print as output of " + r + " characters exceeds pad width of " + this._padWidth);
                for (var s = 0; s < this._padWidth - r; s++) e.insert(i, this._padChar);
                return !0
            }, e.parse = function(t, e, n) {
                var i = t.isStrict(),
                    r = t.isCaseSensitive();
                if (l(!(n > e.length)), l(n >= 0), n === e.length) return ~n;
                var s = n + this._padWidth;
                if (s > e.length) {
                    if (i) return ~n;
                    s = e.length
                }
                for (var o = n; o < s && (r ? e[o] === this._padChar : t.charEquals(e[o], this._padChar));) o++;
                e = e.substring(0, s);
                var a = this._printerParser.parse(t, e, o);
                return a !== s && i ? ~(n + o) : a
            }, e.toString = function() {
                return "Pad(" + this._printerParser + "," + this._padWidth + (" " === this._padChar ? ")" : ",'" + this._padChar + "')")
            }, t
        }(),
        Mt = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t);
            var n = e.prototype;
            return n.print = function() {
                return !0
            }, n.parse = function(t, n, i) {
                switch (this) {
                    case e.SENSITIVE:
                        t.setCaseSensitive(!0);
                        break;
                    case e.INSENSITIVE:
                        t.setCaseSensitive(!1);
                        break;
                    case e.STRICT:
                        t.setStrict(!0);
                        break;
                    case e.LENIENT:
                        t.setStrict(!1)
                }
                return i
            }, n.toString = function() {
                switch (this) {
                    case e.SENSITIVE:
                        return "ParseCaseSensitive(true)";
                    case e.INSENSITIVE:
                        return "ParseCaseSensitive(false)";
                    case e.STRICT:
                        return "ParseStrict(true)";
                    case e.LENIENT:
                        return "ParseStrict(false)"
                }
            }, e
        }(N);
    Mt.SENSITIVE = new Mt("SENSITIVE"), Mt.INSENSITIVE = new Mt("INSENSITIVE"), Mt.STRICT = new Mt("STRICT"), Mt.LENIENT = new Mt("LENIENT");
    var Rt = function() {
            function t(t) {
                this._literal = t
            }
            var e = t.prototype;
            return e.print = function(t, e) {
                return e.append(this._literal), !0
            }, e.parse = function(t, e, n) {
                return l(!(n > e.length || n < 0)), !1 === t.subSequenceEquals(e, n, this._literal, 0, this._literal.length) ? ~n : n + this._literal.length
            }, e.toString = function() {
                return "'" + this._literal.replace("'", "''") + "'"
            }, t
        }(),
        gt = function() {
            function t() {}
            return t.getRules = function(t) {
                throw new n("unsupported ZoneId:" + t)
            }, t.getAvailableZoneIds = function() {
                return []
            }, t
        }(),
        It = function(t) {
            function e(e, n) {
                var i;
                return (i = t.call(this) || this)._id = e, i._rules = n, i
            }
            h(e, t), e.ofId = function(t) {
                return new e(t, gt.getRules(t))
            };
            var n = e.prototype;
            return n.id = function() {
                return this._id
            }, n.rules = function() {
                return this._rules
            }, e
        }(Z),
        Ft = function() {
            function t(t, e) {
                this.query = t, this.description = e
            }
            var e = t.prototype;
            return e.print = function(t, e) {
                var n = t.getValueQuery(this.query);
                return null != n && (e.append(n.id()), !0)
            }, e.parse = function(t, e, n) {
                var i = e.length;
                if (n > i) return ~n;
                if (n === i) return ~n;
                var r = e.charAt(n);
                if ("+" === r || "-" === r) {
                    var s = t.copy(),
                        o = wt.INSTANCE_ID.parse(s, e, n);
                    if (o < 0) return o;
                    var a = s.getParsed(R.OFFSET_SECONDS),
                        u = X.ofTotalSeconds(a);
                    return t.setParsedZone(u), o
                }
                if (i >= n + 2) {
                    var h = e.charAt(n + 1);
                    if (t.charEquals(r, "U") && t.charEquals(h, "T")) return i >= n + 3 && t.charEquals(e.charAt(n + 2), "C") ? this._parsePrefixedOffset(t, e, n, n + 3) : this._parsePrefixedOffset(t, e, n, n + 2);
                    if (t.charEquals(r, "G") && i >= n + 3 && t.charEquals(h, "M") && t.charEquals(e.charAt(n + 2), "T")) return this._parsePrefixedOffset(t, e, n, n + 3)
                }
                if ("SYSTEM" === e.substr(n, 6)) return t.setParsedZone(Z.systemDefault()), n + 6;
                if (t.charEquals(r, "Z")) return t.setParsedZone(X.UTC), n + 1;
                var f = gt.getAvailableZoneIds();
                Lt.size !== f.length && (Lt = Yt.createTreeMap(f));
                for (var c = i - n, l = Lt.treeMap, _ = null, d = 0; null != l;) {
                    var p = e.substr(n, Math.min(l.length, c));
                    null != (l = l.get(p)) && l.isLeaf && (_ = p, d = l.length)
                }
                return null != _ ? (t.setParsedZone(It.ofId(_)), n + d) : ~n
            }, e._parsePrefixedOffset = function(t, e, n, i) {
                var r = e.substring(n, i).toUpperCase(),
                    s = t.copy();
                if (i < e.length && t.charEquals(e.charAt(i), "Z")) return t.setParsedZone(Z.ofOffset(r, X.UTC)), i;
                var o = wt.INSTANCE_ID.parse(s, e, i);
                if (o < 0) return t.setParsedZone(Z.ofOffset(r, X.UTC)), i;
                var a = s.getParsed(R.OFFSET_SECONDS),
                    u = X.ofTotalSeconds(a);
                return t.setParsedZone(Z.ofOffset(r, u)), o
            }, e.toString = function() {
                return this.description
            }, t
        }(),
        Yt = function() {
            function t(t, e) {
                this.size = t, this.treeMap = e
            }
            return t.createTreeMap = function(e) {
                for (var n = e.sort((function(t, e) {
                        return t.length - e.length
                    })), i = new Ct(n[0].length, !1), r = 0; r < n.length; r++) i.add(n[r]);
                return new t(n.length, i)
            }, t
        }(),
        Ct = function() {
            function t(t, e) {
                void 0 === t && (t = 0), void 0 === e && (e = !1), this.length = t, this.isLeaf = e, this._treeMap = {}
            }
            var e = t.prototype;
            return e.add = function(e) {
                var n = e.length;
                if (n === this.length) this._treeMap[e] = new t(n, !0);
                else if (n > this.length) {
                    var i = e.substr(0, this.length),
                        r = this._treeMap[i];
                    null == r && (r = new t(n, !1), this._treeMap[i] = r), r.add(e)
                }
            }, e.get = function(t) {
                return this._treeMap[t]
            }, t
        }(),
        Lt = new Yt([]),
        Pt = 15,
        Ut = function() {
            function t() {
                this._active = this, this._parent = null, this._printerParsers = [], this._optional = !1, this._padNextWidth = 0, this._padNextChar = null, this._valueParserIndex = -1
            }
            t._of = function(e, n) {
                _(e, "parent"), _(n, "optional");
                var i = new t;
                return i._parent = e, i._optional = n, i
            };
            var e = t.prototype;
            return e.parseCaseSensitive = function() {
                return this._appendInternalPrinterParser(Mt.SENSITIVE), this
            }, e.parseCaseInsensitive = function() {
                return this._appendInternalPrinterParser(Mt.INSENSITIVE), this
            }, e.parseStrict = function() {
                return this._appendInternalPrinterParser(Mt.STRICT), this
            }, e.parseLenient = function() {
                return this._appendInternalPrinterParser(Mt.LENIENT), this
            }, e.parseDefaulting = function(t, e) {
                return _(t), this._appendInternal(new Wt(t, e)), this
            }, e.appendValue = function() {
                return 1 === arguments.length ? this._appendValue1.apply(this, arguments) : 2 === arguments.length ? this._appendValue2.apply(this, arguments) : this._appendValue4.apply(this, arguments)
            }, e._appendValue1 = function(t) {
                return _(t), this._appendValuePrinterParser(new At(t, 1, Pt, Ot.NORMAL)), this
            }, e._appendValue2 = function(t, e) {
                if (_(t), e < 1 || e > Pt) throw new o("The width must be from 1 to 15 inclusive but was " + e);
                var n = new At(t, e, e, Ot.NOT_NEGATIVE);
                return this._appendValuePrinterParser(n), this
            }, e._appendValue4 = function(t, e, n, i) {
                if (_(t), _(i), e === n && i === Ot.NOT_NEGATIVE) return this._appendValue2(t, n);
                if (e < 1 || e > Pt) throw new o("The minimum width must be from 1 to 15 inclusive but was " + e);
                if (n < 1 || n > Pt) throw new o("The minimum width must be from 1 to 15 inclusive but was " + n);
                if (n < e) throw new o("The maximum width must exceed or equal the minimum width but " + n + " < " + e);
                var r = new At(t, e, n, i);
                return this._appendValuePrinterParser(r), this
            }, e.appendValueReduced = function() {
                return 4 === arguments.length && arguments[3] instanceof B ? this._appendValueReducedFieldWidthMaxWidthBaseDate.apply(this, arguments) : this._appendValueReducedFieldWidthMaxWidthBaseValue.apply(this, arguments)
            }, e._appendValueReducedFieldWidthMaxWidthBaseValue = function(t, e, n, i) {
                _(t, "field");
                var r = new Tt(t, e, n, i, null);
                return this._appendValuePrinterParser(r), this
            }, e._appendValueReducedFieldWidthMaxWidthBaseDate = function(t, e, n, i) {
                _(t, "field"), _(i, "baseDate"), d(i, B, "baseDate");
                var r = new Tt(t, e, n, 0, i);
                return this._appendValuePrinterParser(r), this
            }, e._appendValuePrinterParser = function(t) {
                if (l(null != t), this._active._valueParserIndex >= 0 && this._active._printerParsers[this._active._valueParserIndex] instanceof At) {
                    var e = this._active._valueParserIndex,
                        n = this._active._printerParsers[e];
                    t.minWidth() === t.maxWidth() && t.signStyle() === Ot.NOT_NEGATIVE ? (n = n.withSubsequentWidth(t.maxWidth()), this._appendInternal(t.withFixedWidth()), this._active._valueParserIndex = e) : (n = n.withFixedWidth(), this._active._valueParserIndex = this._appendInternal(t)), this._active._printerParsers[e] = n
                } else this._active._valueParserIndex = this._appendInternal(t);
                return this
            }, e.appendFraction = function(t, e, n, i) {
                return this._appendInternal(new Nt(t, e, n, i)), this
            }, e.appendInstant = function(t) {
                if (void 0 === t && (t = -2), t < -2 || t > 9) throw new o("Invalid fractional digits: " + t);
                return this._appendInternal(new Ht(t)), this
            }, e.appendOffsetId = function() {
                return this._appendInternal(wt.INSTANCE_ID), this
            }, e.appendOffset = function(t, e) {
                return this._appendInternalPrinterParser(new wt(e, t)), this
            }, e.appendZoneId = function() {
                return this._appendInternal(new Ft(g.zoneId(), "ZoneId()")), this
            }, e.appendPattern = function(t) {
                return _(t, "pattern"), this._parsePattern(t), this
            }, e.appendZoneText = function() {
                throw new o("Pattern using (localized) text not implemented, use @js-joda/locale plugin!")
            }, e.appendText = function() {
                throw new o("Pattern using (localized) text not implemented, use @js-joda/locale plugin!")
            }, e.appendLocalizedOffset = function() {
                throw new o("Pattern using (localized) text not implemented, use @js-joda/locale plugin!")
            }, e.appendWeekField = function() {
                throw new o("Pattern using (localized) text not implemented, use @js-joda/locale plugin!")
            }, e._parsePattern = function(t) {
                for (var e = {
                        G: R.ERA,
                        y: R.YEAR_OF_ERA,
                        u: R.YEAR,
                        Q: et.QUARTER_OF_YEAR,
                        q: et.QUARTER_OF_YEAR,
                        M: R.MONTH_OF_YEAR,
                        L: R.MONTH_OF_YEAR,
                        D: R.DAY_OF_YEAR,
                        d: R.DAY_OF_MONTH,
                        F: R.ALIGNED_DAY_OF_WEEK_IN_MONTH,
                        E: R.DAY_OF_WEEK,
                        c: R.DAY_OF_WEEK,
                        e: R.DAY_OF_WEEK,
                        a: R.AMPM_OF_DAY,
                        H: R.HOUR_OF_DAY,
                        k: R.CLOCK_HOUR_OF_DAY,
                        K: R.HOUR_OF_AMPM,
                        h: R.CLOCK_HOUR_OF_AMPM,
                        m: R.MINUTE_OF_HOUR,
                        s: R.SECOND_OF_MINUTE,
                        S: R.NANO_OF_SECOND,
                        A: R.MILLI_OF_DAY,
                        n: R.NANO_OF_SECOND,
                        N: R.NANO_OF_DAY
                    }, n = 0; n < t.length; n++) {
                    var i = t.charAt(n);
                    if (i >= "A" && i <= "Z" || i >= "a" && i <= "z") {
                        for (var r = n++; n < t.length && t.charAt(n) === i; n++);
                        var s = n - r;
                        if ("p" === i) {
                            var a = 0;
                            if (n < t.length && ((i = t.charAt(n)) >= "A" && i <= "Z" || i >= "a" && i <= "z")) {
                                for (a = s, r = n++; n < t.length && t.charAt(n) === i; n++);
                                s = n - r
                            }
                            if (0 === a) throw new o("Pad letter 'p' must be followed by valid pad pattern: " + t);
                            this.padNext(a)
                        }
                        var u = e[i];
                        if (null != u) this._parseField(i, s, u);
                        else if ("z" === i) {
                            if (s > 4) throw new o("Too many pattern letters: " + i);
                            4 === s ? this.appendZoneText(Et.FULL) : this.appendZoneText(Et.SHORT)
                        } else if ("V" === i) {
                            if (2 !== s) throw new o("Pattern letter count must be 2: " + i);
                            this.appendZoneId()
                        } else if ("Z" === i)
                            if (s < 4) this.appendOffset("+HHMM", "+0000");
                            else if (4 === s) this.appendLocalizedOffset(Et.FULL);
                        else {
                            if (5 !== s) throw new o("Too many pattern letters: " + i);
                            this.appendOffset("+HH:MM:ss", "Z")
                        } else if ("O" === i)
                            if (1 === s) this.appendLocalizedOffset(Et.SHORT);
                            else {
                                if (4 !== s) throw new o("Pattern letter count must be 1 or 4: " + i);
                                this.appendLocalizedOffset(Et.FULL)
                            }
                        else if ("X" === i) {
                            if (s > 5) throw new o("Too many pattern letters: " + i);
                            this.appendOffset(wt.PATTERNS[s + (1 === s ? 0 : 1)], "Z")
                        } else if ("x" === i) {
                            if (s > 5) throw new o("Too many pattern letters: " + i);
                            var h = 1 === s ? "+00" : s % 2 == 0 ? "+0000" : "+00:00";
                            this.appendOffset(wt.PATTERNS[s + (1 === s ? 0 : 1)], h)
                        } else if ("W" === i) {
                            if (s > 1) throw new o("Too many pattern letters: " + i);
                            this.appendWeekField("W", s)
                        } else if ("w" === i) {
                            if (s > 2) throw new o("Too many pattern letters: " + i);
                            this.appendWeekField("w", s)
                        } else {
                            if ("Y" !== i) throw new o("Unknown pattern letter: " + i);
                            this.appendWeekField("Y", s)
                        }
                        n--
                    } else if ("'" === i) {
                        for (var f = n++; n < t.length; n++)
                            if ("'" === t.charAt(n)) {
                                if (!(n + 1 < t.length && "'" === t.charAt(n + 1))) break;
                                n++
                            } if (n >= t.length) throw new o("Pattern ends with an incomplete string literal: " + t);
                        var c = t.substring(f + 1, n);
                        0 === c.length ? this.appendLiteral("'") : this.appendLiteral(c.replace("''", "'"))
                    } else if ("[" === i) this.optionalStart();
                    else if ("]" === i) {
                        if (null === this._active._parent) throw new o("Pattern invalid as it contains ] without previous [");
                        this.optionalEnd()
                    } else {
                        if ("{" === i || "}" === i || "#" === i) throw new o("Pattern includes reserved character: '" + i + "'");
                        this.appendLiteral(i)
                    }
                }
            }, e._parseField = function(t, e, n) {
                switch (t) {
                    case "u":
                    case "y":
                        2 === e ? this.appendValueReduced(n, 2, 2, Tt.BASE_DATE) : e < 4 ? this.appendValue(n, e, Pt, Ot.NORMAL) : this.appendValue(n, e, Pt, Ot.EXCEEDS_PAD);
                        break;
                    case "M":
                    case "Q":
                        switch (e) {
                            case 1:
                                this.appendValue(n);
                                break;
                            case 2:
                                this.appendValue(n, 2);
                                break;
                            case 3:
                                this.appendText(n, Et.SHORT);
                                break;
                            case 4:
                                this.appendText(n, Et.FULL);
                                break;
                            case 5:
                                this.appendText(n, Et.NARROW);
                                break;
                            default:
                                throw new o("Too many pattern letters: " + t)
                        }
                        break;
                    case "L":
                    case "q":
                        switch (e) {
                            case 1:
                                this.appendValue(n);
                                break;
                            case 2:
                                this.appendValue(n, 2);
                                break;
                            case 3:
                                this.appendText(n, Et.SHORT_STANDALONE);
                                break;
                            case 4:
                                this.appendText(n, Et.FULL_STANDALONE);
                                break;
                            case 5:
                                this.appendText(n, Et.NARROW_STANDALONE);
                                break;
                            default:
                                throw new o("Too many pattern letters: " + t)
                        }
                        break;
                    case "e":
                        switch (e) {
                            case 1:
                            case 2:
                                this.appendWeekField("e", e);
                                break;
                            case 3:
                                this.appendText(n, Et.SHORT);
                                break;
                            case 4:
                                this.appendText(n, Et.FULL);
                                break;
                            case 5:
                                this.appendText(n, Et.NARROW);
                                break;
                            default:
                                throw new o("Too many pattern letters: " + t)
                        }
                        break;
                    case "c":
                        switch (e) {
                            case 1:
                                this.appendWeekField("c", e);
                                break;
                            case 2:
                                throw new o("Invalid number of pattern letters: " + t);
                            case 3:
                                this.appendText(n, Et.SHORT_STANDALONE);
                                break;
                            case 4:
                                this.appendText(n, Et.FULL_STANDALONE);
                                break;
                            case 5:
                                this.appendText(n, Et.NARROW_STANDALONE);
                                break;
                            default:
                                throw new o("Too many pattern letters: " + t)
                        }
                        break;
                    case "a":
                        if (1 !== e) throw new o("Too many pattern letters: " + t);
                        this.appendText(n, Et.SHORT);
                        break;
                    case "E":
                    case "G":
                        switch (e) {
                            case 1:
                            case 2:
                            case 3:
                                this.appendText(n, Et.SHORT);
                                break;
                            case 4:
                                this.appendText(n, Et.FULL);
                                break;
                            case 5:
                                this.appendText(n, Et.NARROW);
                                break;
                            default:
                                throw new o("Too many pattern letters: " + t)
                        }
                        break;
                    case "S":
                        this.appendFraction(R.NANO_OF_SECOND, e, e, !1);
                        break;
                    case "F":
                        if (1 !== e) throw new o("Too many pattern letters: " + t);
                        this.appendValue(n);
                        break;
                    case "d":
                    case "h":
                    case "H":
                    case "k":
                    case "K":
                    case "m":
                    case "s":
                        if (1 === e) this.appendValue(n);
                        else {
                            if (2 !== e) throw new o("Too many pattern letters: " + t);
                            this.appendValue(n, e)
                        }
                        break;
                    case "D":
                        if (1 === e) this.appendValue(n);
                        else {
                            if (!(e <= 3)) throw new o("Too many pattern letters: " + t);
                            this.appendValue(n, e)
                        }
                        break;
                    default:
                        1 === e ? this.appendValue(n) : this.appendValue(n, e)
                }
            }, e.padNext = function() {
                return 1 === arguments.length ? this._padNext1.apply(this, arguments) : this._padNext2.apply(this, arguments)
            }, e._padNext1 = function(t) {
                return this._padNext2(t, " ")
            }, e._padNext2 = function(t, e) {
                if (t < 1) throw new o("The pad width must be at least one but was " + t);
                return this._active._padNextWidth = t, this._active._padNextChar = e, this._active._valueParserIndex = -1, this
            }, e.optionalStart = function() {
                return this._active._valueParserIndex = -1, this._active = t._of(this._active, !0), this
            }, e.optionalEnd = function() {
                if (null == this._active._parent) throw new a("Cannot call optionalEnd() as there was no previous call to optionalStart()");
                if (this._active._printerParsers.length > 0) {
                    var t = new mt(this._active._printerParsers, this._active._optional);
                    this._active = this._active._parent, this._appendInternal(t)
                } else this._active = this._active._parent;
                return this
            }, e._appendInternal = function(t) {
                return l(null != t), this._active._padNextWidth > 0 && (null != t && (t = new yt(t, this._active._padNextWidth, this._active._padNextChar)), this._active._padNextWidth = 0, this._active._padNextChar = 0), this._active._printerParsers.push(t), this._active._valueParserIndex = -1, this._active._printerParsers.length - 1
            }, e.appendLiteral = function(t) {
                return l(null != t), t.length > 0 && (1 === t.length ? this._appendInternalPrinterParser(new St(t.charAt(0))) : this._appendInternalPrinterParser(new Rt(t))), this
            }, e._appendInternalPrinterParser = function(t) {
                return l(null != t), this._active._padNextWidth > 0 && (null != t && (t = new yt(t, this._active._padNextWidth, this._active._padNextChar)), this._active._padNextWidth = 0, this._active._padNextChar = 0), this._active._printerParsers.push(t), this._active._valueParserIndex = -1, this._active._printerParsers.length - 1
            }, e.append = function(t) {
                return _(t, "formatter"), this._appendInternal(t._toPrinterParser(!1)), this
            }, e.toFormatter = function(t) {
                for (void 0 === t && (t = x.SMART); null != this._active._parent;) this.optionalEnd();
                var e = new mt(this._printerParsers, !1);
                return new kt(e, null, pt.STANDARD, t, null, null, null)
            }, t
        }(),
        Vt = 31556952e4,
        bt = 62167219200,
        Ht = function() {
            function t(t) {
                this.fractionalDigits = t
            }
            var e = t.prototype;
            return e.print = function(t, e) {
                var n = t.getValue(R.INSTANT_SECONDS),
                    i = 0;
                if (t.temporal().isSupported(R.NANO_OF_SECOND) && (i = t.temporal().getLong(R.NANO_OF_SECOND)), null == n) return !1;
                var r = n,
                    s = R.NANO_OF_SECOND.checkValidIntValue(i);
                if (r >= -62167219200) {
                    var o = r - Vt + bt,
                        a = m.floorDiv(o, Vt) + 1,
                        u = m.floorMod(o, Vt),
                        h = he.ofEpochSecond(u - bt, 0, X.UTC);
                    a > 0 && e.append("+").append(a), e.append(h.toString()), 0 === h.second() && e.append(":00")
                } else {
                    var f = r + bt,
                        c = m.intDiv(f, Vt),
                        l = m.intMod(f, Vt),
                        _ = he.ofEpochSecond(l - bt, 0, X.UTC),
                        d = e.length();
                    e.append(_.toString()), 0 === _.second() && e.append(":00"), c < 0 && (-1e4 === _.year() ? e.replace(d, d + 2, "" + (c - 1)) : 0 === l ? e.insert(d, c) : e.insert(d + 1, Math.abs(c)))
                }
                if (-2 === this.fractionalDigits) 0 !== s && (e.append("."), 0 === m.intMod(s, 1e6) ? e.append(("" + (m.intDiv(s, 1e6) + 1e3)).substring(1)) : 0 === m.intMod(s, 1e3) ? e.append(("" + (m.intDiv(s, 1e3) + 1e6)).substring(1)) : e.append(("" + (s + 1e9)).substring(1)));
                else if (this.fractionalDigits > 0 || -1 === this.fractionalDigits && s > 0) {
                    e.append(".");
                    for (var p = 1e8, O = 0; - 1 === this.fractionalDigits && s > 0 || O < this.fractionalDigits; O++) {
                        var E = m.intDiv(s, p);
                        e.append(E), s -= E * p, p = m.intDiv(p, 10)
                    }
                }
                return e.append("Z"), !0
            }, e.parse = function(t, e, n) {
                var i = t.copy(),
                    r = this.fractionalDigits < 0 ? 0 : this.fractionalDigits,
                    s = this.fractionalDigits < 0 ? 9 : this.fractionalDigits,
                    o = (new Ut).append(kt.ISO_LOCAL_DATE).appendLiteral("T").appendValue(R.HOUR_OF_DAY, 2).appendLiteral(":").appendValue(R.MINUTE_OF_HOUR, 2).appendLiteral(":").appendValue(R.SECOND_OF_MINUTE, 2).appendFraction(R.NANO_OF_SECOND, r, s, !0).appendLiteral("Z").toFormatter()._toPrinterParser(!1).parse(i, e, n);
                if (o < 0) return o;
                var a, u = i.getParsed(R.YEAR),
                    h = i.getParsed(R.MONTH_OF_YEAR),
                    f = i.getParsed(R.DAY_OF_MONTH),
                    c = i.getParsed(R.HOUR_OF_DAY),
                    l = i.getParsed(R.MINUTE_OF_HOUR),
                    _ = i.getParsed(R.SECOND_OF_MINUTE),
                    d = i.getParsed(R.NANO_OF_SECOND),
                    p = null != _ ? _ : 0,
                    O = null != d ? d : 0,
                    E = m.intMod(u, 1e4),
                    S = 0;
                24 === c && 0 === l && 0 === p && 0 === O ? (c = 0, S = 1) : 23 === c && 59 === l && 60 === p && (t.setParsedLeapSecond(), p = 59);
                try {
                    a = he.of(E, h, f, c, l, p, 0).plusDays(S).toEpochSecond(X.UTC), a += m.safeMultiply(m.intDiv(u, 1e4), Vt)
                } catch (t) {
                    return ~n
                }
                var N = o;
                return N = t.setParsedField(R.INSTANT_SECONDS, a, n, N), t.setParsedField(R.NANO_OF_SECOND, O, n, N)
            }, e.toString = function() {
                return "Instant()"
            }, t
        }(),
        Wt = function() {
            function t(t, e) {
                this._field = t, this._value = e
            }
            var e = t.prototype;
            return e.print = function() {
                return !0
            }, e.parse = function(t, e, n) {
                return null == t.getParsed(this._field) && t.setParsedField(this._field, this._value, n, n), n
            }, t
        }();
    var xt = function() {
            function t() {
                this._str = ""
            }
            var e = t.prototype;
            return e.append = function(t) {
                return this._str += t, this
            }, e.appendChar = function(t) {
                return this._str += t[0], this
            }, e.insert = function(t, e) {
                return this._str = this._str.slice(0, t) + e + this._str.slice(t), this
            }, e.replace = function(t, e, n) {
                return this._str = this._str.slice(0, t) + n + this._str.slice(e), this
            }, e.length = function() {
                return this._str.length
            }, e.setLength = function(t) {
                return this._str = this._str.slice(0, t), this
            }, e.toString = function() {
                return this._str
            }, t
        }(),
        kt = function() {
            function t(t, e, n, i, r, s, o) {
                void 0 === s && (s = te.INSTANCE), l(null != t), l(null != n), l(null != i), this._printerParser = t, this._locale = e, this._decimalStyle = n, this._resolverStyle = i, this._resolverFields = r, this._chrono = s, this._zone = o
            }
            t.parsedExcessDays = function() {
                return t.PARSED_EXCESS_DAYS
            }, t.parsedLeapSecond = function() {
                return t.PARSED_LEAP_SECOND
            }, t.ofPattern = function(t) {
                return (new Ut).appendPattern(t).toFormatter()
            };
            var e = t.prototype;
            return e.locale = function() {
                return this._locale
            }, e.decimalStyle = function() {
                return this._decimalStyle
            }, e.chronology = function() {
                return this._chrono
            }, e.withChronology = function(e) {
                return null != this._chrono && this._chrono.equals(e) ? this : new t(this._printerParser, this._locale, this._decimalStyle, this._resolverStyle, this._resolverFields, e, this._zone)
            }, e.withLocale = function() {
                return this
            }, e.withResolverStyle = function(e) {
                return _(e, "resolverStyle"), e.equals(this._resolverStyle) ? this : new t(this._printerParser, this._locale, this._decimalStyle, e, this._resolverFields, this._chrono, this._zone)
            }, e.format = function(t) {
                var e = new xt(32);
                return this._formatTo(t, e), e.toString()
            }, e._formatTo = function(t, e) {
                _(t, "temporal"), _(e, "appendable");
                var n = new tt(t, this);
                this._printerParser.print(n, e)
            }, e.parse = function(t, e) {
                return 1 === arguments.length ? this.parse1(t) : this.parse2(t, e)
            }, e.parse1 = function(t) {
                _(t, "text");
                try {
                    return this._parseToBuilder(t, null).resolve(this._resolverStyle, this._resolverFields)
                } catch (e) {
                    throw e instanceof i ? e : this._createError(t, e)
                }
            }, e.parse2 = function(t, e) {
                _(t, "text"), _(e, "type");
                try {
                    return this._parseToBuilder(t, null).resolve(this._resolverStyle, this._resolverFields).build(e)
                } catch (e) {
                    throw e instanceof i ? e : this._createError(t, e)
                }
            }, e._createError = function(t, e) {
                var n = "";
                return n = t.length > 64 ? t.substring(0, 64) + "..." : t, new i("Text '" + n + "' could not be parsed: " + e.message, t, 0, e)
            }, e._parseToBuilder = function(t, e) {
                var n = null != e ? e : new H(0),
                    r = this._parseUnresolved0(t, n);
                if (null == r || n.getErrorIndex() >= 0 || null == e && n.getIndex() < t.length) {
                    var s = "";
                    throw s = t.length > 64 ? t.substr(0, 64).toString() + "..." : t, n.getErrorIndex() >= 0 ? new i("Text '" + s + "' could not be parsed at index " + n.getErrorIndex(), t, n.getErrorIndex()) : new i("Text '" + s + "' could not be parsed, unparsed text found at index " + n.getIndex(), t, n.getIndex())
                }
                return r.toBuilder()
            }, e.parseUnresolved = function(t, e) {
                return this._parseUnresolved0(t, e)
            }, e._parseUnresolved0 = function(t, e) {
                l(null != t, "text", u), l(null != e, "position", u);
                var n = new Q(this),
                    i = e.getIndex();
                return (i = this._printerParser.parse(n, t, i)) < 0 ? (e.setErrorIndex(~i), null) : (e.setIndex(i), n.toParsed())
            }, e._toPrinterParser = function(t) {
                return this._printerParser.withOptional(t)
            }, e.toString = function() {
                var t = this._printerParser.toString();
                return 0 === t.indexOf("[") ? t : t.substring(1, t.length - 1)
            }, t
        }();
    var Bt, qt = function(t) {
        function e(e, n) {
            var i;
            return (i = t.call(this) || this)._month = m.safeToInt(e), i._day = m.safeToInt(n), i
        }
        h(e, t), e.now = function(t) {
            return 0 === arguments.length ? e.now0() : 1 === arguments.length && t instanceof Z ? e.nowZoneId(t) : e.nowClock(t)
        }, e.now0 = function() {
            return this.nowClock(_e.systemDefaultZone())
        }, e.nowZoneId = function(t) {
            return _(t, "zone"), this.nowClock(_e.system(t))
        }, e.nowClock = function(t) {
            _(t, "clock");
            var n = ae.now(t);
            return e.of(n.month(), n.dayOfMonth())
        }, e.of = function(t, n) {
            return 2 === arguments.length && t instanceof U ? e.ofMonthNumber(t, n) : e.ofNumberNumber(t, n)
        }, e.ofMonthNumber = function(t, i) {
            if (_(t, "month"), R.DAY_OF_MONTH.checkValidValue(i), i > t.maxLength()) throw new n("Illegal value for DayOfMonth field, value " + i + " is not valid for month " + t.toString());
            return new e(t.value(), i)
        }, e.ofNumberNumber = function(t, n) {
            return _(t, "month"), _(n, "dayOfMonth"), e.of(U.of(t), n)
        }, e.from = function(t) {
            if (_(t, "temporal"), d(t, I, "temporal"), t instanceof e) return t;
            try {
                return e.of(t.get(R.MONTH_OF_YEAR), t.get(R.DAY_OF_MONTH))
            } catch (e) {
                throw new n("Unable to obtain MonthDay from TemporalAccessor: " + t + ", type " + (t && null != t.constructor ? t.constructor.name : ""))
            }
        }, e.parse = function(t, n) {
            return 1 === arguments.length ? e.parseString(t) : e.parseStringFormatter(t, n)
        }, e.parseString = function(t) {
            return e.parseStringFormatter(t, Bt)
        }, e.parseStringFormatter = function(t, n) {
            return _(t, "text"), _(n, "formatter"), d(n, kt, "formatter"), n.parse(t, e.FROM)
        };
        var i = e.prototype;
        return i.monthValue = function() {
            return this._month
        }, i.month = function() {
            return U.of(this._month)
        }, i.dayOfMonth = function() {
            return this._day
        }, i.isSupported = function(t) {
            return t instanceof R ? t === R.MONTH_OF_YEAR || t === R.DAY_OF_MONTH : null != t && t.isSupportedBy(this)
        }, i.range = function(e) {
            return e === R.MONTH_OF_YEAR ? e.range() : e === R.DAY_OF_MONTH ? M.of(1, this.month().minLength(), this.month().maxLength()) : t.prototype.range.call(this, e)
        }, i.get = function(t) {
            return this.range(t).checkValidIntValue(this.getLong(t), t)
        }, i.getLong = function(t) {
            if (_(t, "field"), t instanceof R) {
                switch (t) {
                    case R.DAY_OF_MONTH:
                        return this._day;
                    case R.MONTH_OF_YEAR:
                        return this._month
                }
                throw new r("Unsupported field: " + t)
            }
            return t.getFrom(this)
        }, i.isValidYear = function(t) {
            return !1 == (29 === this._day && 2 === this._month && !1 === jt.isLeap(t))
        }, i.withMonth = function(t) {
            return this.with(U.of(t))
        }, i.with = function(t) {
            if (_(t, "month"), t.value() === this._month) return this;
            var n = Math.min(this._day, t.maxLength());
            return new e(t.value(), n)
        }, i.withDayOfMonth = function(t) {
            return t === this._day ? this : e.of(this._month, t)
        }, i.query = function(e) {
            return _(e, "query"), d(e, F, "query"), e === g.chronology() ? te.INSTANCE : t.prototype.query.call(this, e)
        }, i.adjustInto = function(t) {
            return _(t, "temporal"), (t = t.with(R.MONTH_OF_YEAR, this._month)).with(R.DAY_OF_MONTH, Math.min(t.range(R.DAY_OF_MONTH).maximum(), this._day))
        }, i.atYear = function(t) {
            return ae.of(t, this._month, this.isValidYear(t) ? this._day : 28)
        }, i.compareTo = function(t) {
            _(t, "other"), d(t, e, "other");
            var n = this._month - t.monthValue();
            return 0 === n && (n = this._day - t.dayOfMonth()), n
        }, i.isAfter = function(t) {
            return _(t, "other"), d(t, e, "other"), this.compareTo(t) > 0
        }, i.isBefore = function(t) {
            return _(t, "other"), d(t, e, "other"), this.compareTo(t) < 0
        }, i.equals = function(t) {
            if (this === t) return !0;
            if (t instanceof e) {
                var n = t;
                return this.monthValue() === n.monthValue() && this.dayOfMonth() === n.dayOfMonth()
            }
            return !1
        }, i.toString = function() {
            return "--" + (this._month < 10 ? "0" : "") + this._month + (this._day < 10 ? "-0" : "-") + this._day
        }, i.toJSON = function() {
            return this.toString()
        }, i.format = function(t) {
            return _(t, "formatter"), d(t, kt, "formatter"), t.format(this)
        }, e
    }(I);
    var Zt, zt = function(t) {
        function e(e, n) {
            var i;
            return (i = t.call(this) || this)._year = m.safeToInt(e), i._month = m.safeToInt(n), i
        }
        h(e, t), e.now = function(t) {
            return 0 === arguments.length ? e.now0() : 1 === arguments.length && t instanceof Z ? e.nowZoneId(t) : e.nowClock(t)
        }, e.now0 = function() {
            return e.nowClock(_e.systemDefaultZone())
        }, e.nowZoneId = function(t) {
            return e.nowClock(_e.system(t))
        }, e.nowClock = function(t) {
            var n = ae.now(t);
            return e.of(n.year(), n.month())
        }, e.of = function(t, n) {
            return 2 === arguments.length && n instanceof U ? e.ofNumberMonth(t, n) : e.ofNumberNumber(t, n)
        }, e.ofNumberMonth = function(t, n) {
            return _(n, "month"), d(n, U, "month"), e.ofNumberNumber(t, n.value())
        }, e.ofNumberNumber = function(t, n) {
            return _(t, "year"), _(n, "month"), R.YEAR.checkValidValue(t), R.MONTH_OF_YEAR.checkValidValue(n), new e(t, n)
        }, e.from = function(t) {
            if (_(t, "temporal"), t instanceof e) return t;
            try {
                return e.of(t.get(R.YEAR), t.get(R.MONTH_OF_YEAR))
            } catch (e) {
                throw new n("Unable to obtain YearMonth from TemporalAccessor: " + t + ", type " + (t && null != t.constructor ? t.constructor.name : ""))
            }
        }, e.parse = function(t, n) {
            return 1 === arguments.length ? e.parseString(t) : e.parseStringFormatter(t, n)
        }, e.parseString = function(t) {
            return e.parseStringFormatter(t, Zt)
        }, e.parseStringFormatter = function(t, n) {
            return _(n, "formatter"), n.parse(t, e.FROM)
        };
        var i = e.prototype;
        return i.isSupported = function(t) {
            return 1 === arguments.length && t instanceof y ? this.isSupportedField(t) : this.isSupportedUnit(t)
        }, i.isSupportedField = function(t) {
            return t instanceof R ? t === R.YEAR || t === R.MONTH_OF_YEAR || t === R.PROLEPTIC_MONTH || t === R.YEAR_OF_ERA || t === R.ERA : null != t && t.isSupportedBy(this)
        }, i.isSupportedUnit = function(t) {
            return t instanceof w ? t === w.MONTHS || t === w.YEARS || t === w.DECADES || t === w.CENTURIES || t === w.MILLENNIA || t === w.ERAS : null != t && t.isSupportedBy(this)
        }, i.range = function(e) {
            return e === R.YEAR_OF_ERA ? this.year() <= 0 ? M.of(1, jt.MAX_VALUE + 1) : M.of(1, jt.MAX_VALUE) : t.prototype.range.call(this, e)
        }, i.get = function(t) {
            return _(t, "field"), d(t, y, "field"), this.range(t).checkValidIntValue(this.getLong(t), t)
        }, i.getLong = function(t) {
            if (_(t, "field"), d(t, y, "field"), t instanceof R) {
                switch (t) {
                    case R.MONTH_OF_YEAR:
                        return this._month;
                    case R.PROLEPTIC_MONTH:
                        return this._getProlepticMonth();
                    case R.YEAR_OF_ERA:
                        return this._year < 1 ? 1 - this._year : this._year;
                    case R.YEAR:
                        return this._year;
                    case R.ERA:
                        return this._year < 1 ? 0 : 1
                }
                throw new r("Unsupported field: " + t)
            }
            return t.getFrom(this)
        }, i._getProlepticMonth = function() {
            return m.safeAdd(m.safeMultiply(this._year, 12), this._month - 1)
        }, i.year = function() {
            return this._year
        }, i.monthValue = function() {
            return this._month
        }, i.month = function() {
            return U.of(this._month)
        }, i.isLeapYear = function() {
            return te.isLeapYear(this._year)
        }, i.isValidDay = function(t) {
            return t >= 1 && t <= this.lengthOfMonth()
        }, i.lengthOfMonth = function() {
            return this.month().length(this.isLeapYear())
        }, i.lengthOfYear = function() {
            return this.isLeapYear() ? 366 : 365
        }, i.with = function(t, e) {
            return 1 === arguments.length ? this._withAdjuster(t) : this._withField(t, e)
        }, i._withField = function(t, e) {
            if (_(t, "field"), d(t, y, "field"), t instanceof R) {
                var n = t;
                switch (n.checkValidValue(e), n) {
                    case R.MONTH_OF_YEAR:
                        return this.withMonth(e);
                    case R.PROLEPTIC_MONTH:
                        return this.plusMonths(e - this.getLong(R.PROLEPTIC_MONTH));
                    case R.YEAR_OF_ERA:
                        return this.withYear(this._year < 1 ? 1 - e : e);
                    case R.YEAR:
                        return this.withYear(e);
                    case R.ERA:
                        return this.getLong(R.ERA) === e ? this : this.withYear(1 - this._year)
                }
                throw new r("Unsupported field: " + t)
            }
            return t.adjustInto(this, e)
        }, i.withYear = function(t) {
            return R.YEAR.checkValidValue(t), new e(t, this._month)
        }, i.withMonth = function(t) {
            return R.MONTH_OF_YEAR.checkValidValue(t), new e(this._year, t)
        }, i._plusUnit = function(t, e) {
            if (_(e, "unit"), d(e, A, "unit"), e instanceof w) {
                switch (e) {
                    case w.MONTHS:
                        return this.plusMonths(t);
                    case w.YEARS:
                        return this.plusYears(t);
                    case w.DECADES:
                        return this.plusYears(m.safeMultiply(t, 10));
                    case w.CENTURIES:
                        return this.plusYears(m.safeMultiply(t, 100));
                    case w.MILLENNIA:
                        return this.plusYears(m.safeMultiply(t, 1e3));
                    case w.ERAS:
                        return this.with(R.ERA, m.safeAdd(this.getLong(R.ERA), t))
                }
                throw new r("Unsupported unit: " + e)
            }
            return e.addTo(this, t)
        }, i.plusYears = function(t) {
            if (0 === t) return this;
            var e = R.YEAR.checkValidIntValue(this._year + t);
            return this.withYear(e)
        }, i.plusMonths = function(t) {
            if (0 === t) return this;
            var n = 12 * this._year + (this._month - 1) + t;
            return new e(R.YEAR.checkValidIntValue(m.floorDiv(n, 12)), m.floorMod(n, 12) + 1)
        }, i.minusYears = function(t) {
            return t === m.MIN_SAFE_INTEGER ? this.plusYears(m.MIN_SAFE_INTEGER).plusYears(1) : this.plusYears(-t)
        }, i.minusMonths = function(t) {
            return t === m.MIN_SAFE_INTEGER ? this.plusMonths(Math.MAX_SAFE_INTEGER).plusMonths(1) : this.plusMonths(-t)
        }, i.query = function(e) {
            return _(e, "query"), d(e, F, "query"), e === g.chronology() ? te.INSTANCE : e === g.precision() ? w.MONTHS : e === g.localDate() || e === g.localTime() || e === g.zone() || e === g.zoneId() || e === g.offset() ? null : t.prototype.query.call(this, e)
        }, i.adjustInto = function(t) {
            return _(t, "temporal"), d(t, k, "temporal"), t.with(R.PROLEPTIC_MONTH, this._getProlepticMonth())
        }, i.until = function(t, n) {
            _(t, "endExclusive"), _(n, "unit"), d(t, k, "endExclusive"), d(n, A, "unit");
            var i = e.from(t);
            if (n instanceof w) {
                var s = i._getProlepticMonth() - this._getProlepticMonth();
                switch (n) {
                    case w.MONTHS:
                        return s;
                    case w.YEARS:
                        return m.intDiv(s, 12);
                    case w.DECADES:
                        return m.intDiv(s, 120);
                    case w.CENTURIES:
                        return m.intDiv(s, 1200);
                    case w.MILLENNIA:
                        return m.intDiv(s, 12e3);
                    case w.ERAS:
                        return i.getLong(R.ERA) - this.getLong(R.ERA)
                }
                throw new r("Unsupported unit: " + n)
            }
            return n.between(this, i)
        }, i.atDay = function(t) {
            return _(t, "dayOfMonth"), ae.of(this._year, this._month, t)
        }, i.atEndOfMonth = function() {
            return ae.of(this._year, this._month, this.lengthOfMonth())
        }, i.compareTo = function(t) {
            _(t, "other"), d(t, e, "other");
            var n = this._year - t.year();
            return 0 === n && (n = this._month - t.monthValue()), n
        }, i.isAfter = function(t) {
            return this.compareTo(t) > 0
        }, i.isBefore = function(t) {
            return this.compareTo(t) < 0
        }, i.equals = function(t) {
            if (this === t) return !0;
            if (t instanceof e) {
                var n = t;
                return this.year() === n.year() && this.monthValue() === n.monthValue()
            }
            return !1
        }, i.toString = function() {
            return Zt.format(this)
        }, i.toJSON = function() {
            return this.toString()
        }, i.format = function(t) {
            return _(t, "formatter"), t.format(this)
        }, e
    }(k);
    var Kt, jt = function(t) {
        function e(e) {
            var n;
            return (n = t.call(this) || this)._year = m.safeToInt(e), n
        }
        h(e, t);
        var i = e.prototype;
        return i.value = function() {
            return this._year
        }, e.now = function(t) {
            return void 0 === t && (t = void 0), void 0 === t ? e.now0() : t instanceof Z ? e.nowZoneId(t) : e.nowClock(t)
        }, e.now0 = function() {
            return e.nowClock(_e.systemDefaultZone())
        }, e.nowZoneId = function(t) {
            return _(t, "zone"), d(t, Z, "zone"), e.nowClock(_e.system(t))
        }, e.nowClock = function(t) {
            _(t, "clock"), d(t, _e, "clock");
            var n = ae.now(t);
            return e.of(n.year())
        }, e.of = function(t) {
            return _(t, "isoYear"), R.YEAR.checkValidValue(t), new e(t)
        }, e.from = function(t) {
            if (_(t, "temporal"), d(t, I, "temporal"), t instanceof e) return t;
            try {
                return e.of(t.get(R.YEAR))
            } catch (e) {
                throw new n("Unable to obtain Year from TemporalAccessor: " + t + ", type " + (t && null != t.constructor ? t.constructor.name : ""))
            }
        }, e.parse = function(t, n) {
            return arguments.length <= 1 ? e.parseText(t) : e.parseTextFormatter(t, n)
        }, e.parseText = function(t) {
            return _(t, "text"), e.parse(t, Kt)
        }, e.parseTextFormatter = function(t, n) {
            return void 0 === n && (n = Kt), _(t, "text"), _(n, "formatter"), d(n, kt, "formatter"), n.parse(t, e.FROM)
        }, e.isLeap = function(t) {
            return 0 === m.intMod(t, 4) && (0 !== m.intMod(t, 100) || 0 === m.intMod(t, 400))
        }, i.isSupported = function(t) {
            return 1 === arguments.length && t instanceof y ? this.isSupportedField(t) : this.isSupportedUnit(t)
        }, i.isSupportedField = function(t) {
            return t instanceof R ? t === R.YEAR || t === R.YEAR_OF_ERA || t === R.ERA : null != t && t.isSupportedBy(this)
        }, i.isSupportedUnit = function(t) {
            return t instanceof w ? t === w.YEARS || t === w.DECADES || t === w.CENTURIES || t === w.MILLENNIA || t === w.ERAS : null != t && t.isSupportedBy(this)
        }, i.range = function(e) {
            if (this.isSupported(e)) return e.range();
            if (e instanceof R) throw new r("Unsupported field: " + e);
            return t.prototype.range.call(this, e)
        }, i.get = function(t) {
            return this.range(t).checkValidIntValue(this.getLong(t), t)
        }, i.getLong = function(t) {
            if (_(t, "field"), t instanceof R) {
                switch (t) {
                    case R.YEAR_OF_ERA:
                        return this._year < 1 ? 1 - this._year : this._year;
                    case R.YEAR:
                        return this._year;
                    case R.ERA:
                        return this._year < 1 ? 0 : 1
                }
                throw new r("Unsupported field: " + t)
            }
            return t.getFrom(this)
        }, i.isLeap = function() {
            return e.isLeap(this._year)
        }, i._withField = function(t, n) {
            if (_(t, "field"), d(t, y, "field"), t instanceof R) {
                switch (t.checkValidValue(n), t) {
                    case R.YEAR_OF_ERA:
                        return e.of(this._year < 1 ? 1 - n : n);
                    case R.YEAR:
                        return e.of(n);
                    case R.ERA:
                        return this.getLong(R.ERA) === n ? this : e.of(1 - this._year)
                }
                throw new r("Unsupported field: " + t)
            }
            return t.adjustInto(this, n)
        }, i._plusUnit = function(t, e) {
            if (_(t, "amountToAdd"), _(e, "unit"), d(e, A, "unit"), e instanceof w) {
                switch (e) {
                    case w.YEARS:
                        return this.plusYears(t);
                    case w.DECADES:
                        return this.plusYears(m.safeMultiply(t, 10));
                    case w.CENTURIES:
                        return this.plusYears(m.safeMultiply(t, 100));
                    case w.MILLENNIA:
                        return this.plusYears(m.safeMultiply(t, 1e3));
                    case w.ERAS:
                        return this.with(R.ERA, m.safeAdd(this.getLong(R.ERA), t))
                }
                throw new r("Unsupported unit: " + e)
            }
            return e.addTo(this, t)
        }, i.plusYears = function(t) {
            return 0 === t ? this : e.of(R.YEAR.checkValidIntValue(m.safeAdd(this._year, t)))
        }, i.minusYears = function(t) {
            return t === m.MIN_SAFE_INTEGER ? this.plusYears(m.MAX_SAFE_INTEGER).plusYears(1) : this.plusYears(-t)
        }, i.adjustInto = function(t) {
            return _(t, "temporal"), t.with(R.YEAR, this._year)
        }, i.isValidMonthDay = function(t) {
            return null != t && t.isValidYear(this._year)
        }, i.length = function() {
            return this.isLeap() ? 366 : 365
        }, i.atDay = function(t) {
            return ae.ofYearDay(this._year, t)
        }, i.atMonth = function(t) {
            return 1 === arguments.length && t instanceof U ? this.atMonthMonth(t) : this.atMonthNumber(t)
        }, i.atMonthMonth = function(t) {
            return _(t, "month"), d(t, U, "month"), zt.of(this._year, t)
        }, i.atMonthNumber = function(t) {
            return _(t, "month"), zt.of(this._year, t)
        }, i.atMonthDay = function(t) {
            return _(t, "monthDay"), d(t, qt, "monthDay"), t.atYear(this._year)
        }, i.query = function(e) {
            return _(e, "query()"), d(e, F, "query()"), e === g.chronology() ? te.INSTANCE : e === g.precision() ? w.YEARS : e === g.localDate() || e === g.localTime() || e === g.zone() || e === g.zoneId() || e === g.offset() ? null : t.prototype.query.call(this, e)
        }, i.compareTo = function(t) {
            return _(t, "other"), d(t, e, "other"), this._year - t._year
        }, i.isAfter = function(t) {
            return _(t, "other"), d(t, e, "other"), this._year > t._year
        }, i.isBefore = function(t) {
            return _(t, "other"), d(t, e, "other"), this._year < t._year
        }, i.format = function(t) {
            return _(t, "formatter"), d(t, kt, "formatter"), t.format(this)
        }, i.equals = function(t) {
            return this === t || t instanceof e && this.value() === t.value()
        }, i.toString = function() {
            return "" + this._year
        }, i.toJSON = function() {
            return this.toString()
        }, i.until = function(t, n) {
            var i = e.from(t);
            if (n instanceof w) {
                var s = i.value() - this.value();
                switch (n) {
                    case w.YEARS:
                        return s;
                    case w.DECADES:
                        return m.intDiv(s, 10);
                    case w.CENTURIES:
                        return m.intDiv(s, 100);
                    case w.MILLENNIA:
                        return m.intDiv(s, 1e3);
                    case w.ERAS:
                        return i.getLong(R.ERA) - this.getLong(R.ERA)
                }
                throw new r("Unsupported unit: " + n)
            }
            return n.between(this, i)
        }, e
    }(k);
    var Gt = function() {
            function t() {}
            return t.prototype.adjustInto = function(t) {
                p("adjustInto")
            }, t
        }(),
        Xt = function() {
            function t() {}
            return t.firstDayOfMonth = function() {
                return Jt.FIRST_DAY_OF_MONTH
            }, t.lastDayOfMonth = function() {
                return Jt.LAST_DAY_OF_MONTH
            }, t.firstDayOfNextMonth = function() {
                return Jt.FIRST_DAY_OF_NEXT_MONTH
            }, t.firstDayOfYear = function() {
                return Jt.FIRST_DAY_OF_YEAR
            }, t.lastDayOfYear = function() {
                return Jt.LAST_DAY_OF_YEAR
            }, t.firstDayOfNextYear = function() {
                return Jt.FIRST_DAY_OF_NEXT_YEAR
            }, t.firstInMonth = function(t) {
                return _(t, "dayOfWeek"), new Qt(1, t)
            }, t.lastInMonth = function(t) {
                return _(t, "dayOfWeek"), new Qt(-1, t)
            }, t.dayOfWeekInMonth = function(t, e) {
                return _(e, "dayOfWeek"), new Qt(t, e)
            }, t.next = function(t) {
                return new $t(2, t)
            }, t.nextOrSame = function(t) {
                return new $t(0, t)
            }, t.previous = function(t) {
                return new $t(3, t)
            }, t.previousOrSame = function(t) {
                return new $t(1, t)
            }, t
        }(),
        Jt = function(t) {
            function e(e) {
                var n;
                return (n = t.call(this) || this)._ordinal = e, n
            }
            return h(e, t), e.prototype.adjustInto = function(t) {
                switch (this._ordinal) {
                    case 0:
                        return t.with(R.DAY_OF_MONTH, 1);
                    case 1:
                        return t.with(R.DAY_OF_MONTH, t.range(R.DAY_OF_MONTH).maximum());
                    case 2:
                        return t.with(R.DAY_OF_MONTH, 1).plus(1, w.MONTHS);
                    case 3:
                        return t.with(R.DAY_OF_YEAR, 1);
                    case 4:
                        return t.with(R.DAY_OF_YEAR, t.range(R.DAY_OF_YEAR).maximum());
                    case 5:
                        return t.with(R.DAY_OF_YEAR, 1).plus(1, w.YEARS)
                }
                throw new a("Unreachable")
            }, e
        }(Gt);
    Jt.FIRST_DAY_OF_MONTH = new Jt(0), Jt.LAST_DAY_OF_MONTH = new Jt(1), Jt.FIRST_DAY_OF_NEXT_MONTH = new Jt(2), Jt.FIRST_DAY_OF_YEAR = new Jt(3), Jt.LAST_DAY_OF_YEAR = new Jt(4), Jt.FIRST_DAY_OF_NEXT_YEAR = new Jt(5);
    var Qt = function(t) {
            function e(e, n) {
                var i;
                return (i = t.call(this) || this)._ordinal = e, i._dowValue = n.value(), i
            }
            return h(e, t), e.prototype.adjustInto = function(t) {
                if (this._ordinal >= 0) {
                    var e = t.with(R.DAY_OF_MONTH, 1),
                        n = e.get(R.DAY_OF_WEEK),
                        i = m.intMod(this._dowValue - n + 7, 7);
                    return i += 7 * (this._ordinal - 1), e.plus(i, w.DAYS)
                }
                var r = t.with(R.DAY_OF_MONTH, t.range(R.DAY_OF_MONTH).maximum()),
                    s = r.get(R.DAY_OF_WEEK),
                    o = this._dowValue - s;
                return o = 0 === o ? 0 : o > 0 ? o - 7 : o, o -= 7 * (-this._ordinal - 1), r.plus(o, w.DAYS)
            }, e
        }(Gt),
        $t = function(t) {
            function e(e, n) {
                var i;
                return i = t.call(this) || this, _(n, "dayOfWeek"), i._relative = e, i._dowValue = n.value(), i
            }
            return h(e, t), e.prototype.adjustInto = function(t) {
                var e = t.get(R.DAY_OF_WEEK);
                if (this._relative < 2 && e === this._dowValue) return t;
                if (0 == (1 & this._relative)) {
                    var n = e - this._dowValue;
                    return t.plus(n >= 0 ? 7 - n : -n, w.DAYS)
                }
                var i = this._dowValue - e;
                return t.minus(i >= 0 ? 7 - i : -i, w.DAYS)
            }, e
        }(Gt),
        te = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t), e.isLeapYear = function(t) {
                return 0 == (3 & t) && (t % 100 != 0 || t % 400 == 0)
            };
            var i = e.prototype;
            return i._updateResolveMap = function(t, e, i) {
                _(t, "fieldValues"), _(e, "field");
                var r = t.get(e);
                if (null != r && r !== i) throw new n("Invalid state, field: " + e + " " + r + " conflicts with " + e + " " + i);
                t.put(e, i)
            }, i.resolveDate = function(t, e) {
                if (t.containsKey(R.EPOCH_DAY)) return ae.ofEpochDay(t.remove(R.EPOCH_DAY));
                var i = t.remove(R.PROLEPTIC_MONTH);
                null != i && (e !== x.LENIENT && R.PROLEPTIC_MONTH.checkValidValue(i), this._updateResolveMap(t, R.MONTH_OF_YEAR, m.floorMod(i, 12) + 1), this._updateResolveMap(t, R.YEAR, m.floorDiv(i, 12)));
                var r = t.remove(R.YEAR_OF_ERA);
                if (null != r) {
                    e !== x.LENIENT && R.YEAR_OF_ERA.checkValidValue(r);
                    var s = t.remove(R.ERA);
                    if (null == s) {
                        var o = t.get(R.YEAR);
                        e === x.STRICT ? null != o ? this._updateResolveMap(t, R.YEAR, o > 0 ? r : m.safeSubtract(1, r)) : t.put(R.YEAR_OF_ERA, r) : this._updateResolveMap(t, R.YEAR, null == o || o > 0 ? r : m.safeSubtract(1, r))
                    } else if (1 === s) this._updateResolveMap(t, R.YEAR, r);
                    else {
                        if (0 !== s) throw new n("Invalid value for era: " + s);
                        this._updateResolveMap(t, R.YEAR, m.safeSubtract(1, r))
                    }
                } else t.containsKey(R.ERA) && R.ERA.checkValidValue(t.get(R.ERA));
                if (t.containsKey(R.YEAR)) {
                    if (t.containsKey(R.MONTH_OF_YEAR) && t.containsKey(R.DAY_OF_MONTH)) {
                        var a = R.YEAR.checkValidIntValue(t.remove(R.YEAR)),
                            u = t.remove(R.MONTH_OF_YEAR),
                            h = t.remove(R.DAY_OF_MONTH);
                        if (e === x.LENIENT) {
                            var f = u - 1,
                                c = h - 1;
                            return ae.of(a, 1, 1).plusMonths(f).plusDays(c)
                        }
                        return e === x.SMART ? (R.DAY_OF_MONTH.checkValidValue(h), 4 === u || 6 === u || 9 === u || 11 === u ? h = Math.min(h, 30) : 2 === u && (h = Math.min(h, U.FEBRUARY.length(jt.isLeap(a)))), ae.of(a, u, h)) : ae.of(a, u, h)
                    }
                    if (t.containsKey(R.DAY_OF_YEAR)) {
                        var l = R.YEAR.checkValidIntValue(t.remove(R.YEAR));
                        if (e === x.LENIENT) {
                            var _ = m.safeSubtract(t.remove(R.DAY_OF_YEAR), 1);
                            return ae.ofYearDay(l, 1).plusDays(_)
                        }
                        var d = R.DAY_OF_YEAR.checkValidIntValue(t.remove(R.DAY_OF_YEAR));
                        return ae.ofYearDay(l, d)
                    }
                    if (t.containsKey(R.ALIGNED_WEEK_OF_YEAR)) {
                        if (t.containsKey(R.ALIGNED_DAY_OF_WEEK_IN_YEAR)) {
                            var p = R.YEAR.checkValidIntValue(t.remove(R.YEAR));
                            if (e === x.LENIENT) {
                                var O = m.safeSubtract(t.remove(R.ALIGNED_WEEK_OF_YEAR), 1),
                                    E = m.safeSubtract(t.remove(R.ALIGNED_DAY_OF_WEEK_IN_YEAR), 1);
                                return ae.of(p, 1, 1).plusWeeks(O).plusDays(E)
                            }
                            var S = R.ALIGNED_WEEK_OF_YEAR.checkValidIntValue(t.remove(R.ALIGNED_WEEK_OF_YEAR)),
                                N = R.ALIGNED_DAY_OF_WEEK_IN_YEAR.checkValidIntValue(t.remove(R.ALIGNED_DAY_OF_WEEK_IN_YEAR)),
                                D = ae.of(p, 1, 1).plusDays(7 * (S - 1) + (N - 1));
                            if (e === x.STRICT && D.get(R.YEAR) !== p) throw new n("Strict mode rejected date parsed to a different year");
                            return D
                        }
                        if (t.containsKey(R.DAY_OF_WEEK)) {
                            var A = R.YEAR.checkValidIntValue(t.remove(R.YEAR));
                            if (e === x.LENIENT) {
                                var T = m.safeSubtract(t.remove(R.ALIGNED_WEEK_OF_YEAR), 1),
                                    v = m.safeSubtract(t.remove(R.DAY_OF_WEEK), 1);
                                return ae.of(A, 1, 1).plusWeeks(T).plusDays(v)
                            }
                            var w = R.ALIGNED_WEEK_OF_YEAR.checkValidIntValue(t.remove(R.ALIGNED_WEEK_OF_YEAR)),
                                y = R.DAY_OF_WEEK.checkValidIntValue(t.remove(R.DAY_OF_WEEK)),
                                M = ae.of(A, 1, 1).plusWeeks(w - 1).with(Xt.nextOrSame(L.of(y)));
                            if (e === x.STRICT && M.get(R.YEAR) !== A) throw new n("Strict mode rejected date parsed to a different month");
                            return M
                        }
                    }
                }
                return null
            }, i.date = function(t) {
                return ae.from(t)
            }, e
        }(N);
    var ee = function(t) {
        function e(e, n) {
            var i;
            return i = t.call(this) || this, _(e, "time"), d(e, fe, "time"), _(n, "offset"), d(n, X, "offset"), i._time = e, i._offset = n, i
        }
        h(e, t), e.from = function(t) {
            if (_(t, "temporal"), t instanceof e) return t;
            if (t instanceof re) return t.toOffsetTime();
            try {
                return new e(fe.from(t), X.from(t))
            } catch (e) {
                throw new n("Unable to obtain OffsetTime TemporalAccessor: " + t + ", type " + (null != t.constructor ? t.constructor.name : ""))
            }
        }, e.now = function(t) {
            return 0 === arguments.length ? e._now(_e.systemDefaultZone()) : t instanceof _e ? e._now(t) : e._now(_e.system(t))
        }, e._now = function(t) {
            _(t, "clock");
            var n = t.instant();
            return e.ofInstant(n, t.zone().rules().offset(n))
        }, e.of = function() {
            return arguments.length <= 2 ? e.ofTimeAndOffset.apply(this, arguments) : e.ofNumbers.apply(this, arguments)
        }, e.ofNumbers = function(t, n, i, r, s) {
            return new e(fe.of(t, n, i, r), s)
        }, e.ofTimeAndOffset = function(t, n) {
            return new e(t, n)
        }, e.ofInstant = function(t, n) {
            _(t, "instant"), d(t, le, "instant"), _(n, "zone"), d(n, Z, "zone");
            var i = n.rules().offset(t),
                r = t.epochSecond() % fe.SECONDS_PER_DAY;
            return (r = (r + i.totalSeconds()) % fe.SECONDS_PER_DAY) < 0 && (r += fe.SECONDS_PER_DAY), new e(fe.ofSecondOfDay(r, t.nano()), i)
        }, e.parse = function(t, n) {
            return void 0 === n && (n = kt.ISO_OFFSET_TIME), _(n, "formatter"), n.parse(t, e.FROM)
        };
        var i = e.prototype;
        return i.adjustInto = function(t) {
            return t.with(R.NANO_OF_DAY, this._time.toNanoOfDay()).with(R.OFFSET_SECONDS, this.offset().totalSeconds())
        }, i.atDate = function(t) {
            return re.of(t, this._time, this._offset)
        }, i.format = function(t) {
            return _(t, "formatter"), t.format(this, e.FROM)
        }, i.get = function(e) {
            return t.prototype.get.call(this, e)
        }, i.getLong = function(t) {
            return t instanceof R ? t === R.OFFSET_SECONDS ? this._offset.totalSeconds() : this._time.getLong(t) : t.getFrom(this)
        }, i.hour = function() {
            return this._time.hour()
        }, i.minute = function() {
            return this._time.minute()
        }, i.second = function() {
            return this._time.second()
        }, i.nano = function() {
            return this._time.nano()
        }, i.offset = function() {
            return this._offset
        }, i.isAfter = function(t) {
            return _(t, "other"), this._toEpochNano() > t._toEpochNano()
        }, i.isBefore = function(t) {
            return _(t, "other"), this._toEpochNano() < t._toEpochNano()
        }, i.isEqual = function(t) {
            return _(t, "other"), this._toEpochNano() === t._toEpochNano()
        }, i.isSupported = function(t) {
            return t instanceof R ? t.isTimeBased() || t === R.OFFSET_SECONDS : t instanceof w ? t.isTimeBased() : null != t && t.isSupportedBy(this)
        }, i.minusHours = function(t) {
            return this._withLocalTimeOffset(this._time.minusHours(t), this._offset)
        }, i.minusMinutes = function(t) {
            return this._withLocalTimeOffset(this._time.minusMinutes(t), this._offset)
        }, i.minusSeconds = function(t) {
            return this._withLocalTimeOffset(this._time.minusSeconds(t), this._offset)
        }, i.minusNanos = function(t) {
            return this._withLocalTimeOffset(this._time.minusNanos(t), this._offset)
        }, i._minusAmount = function(t) {
            return _(t), t.subtractFrom(this)
        }, i._minusUnit = function(t, e) {
            return this.plus(-1 * t, e)
        }, i._plusAmount = function(t) {
            return _(t), t.addTo(this)
        }, i._plusUnit = function(t, e) {
            return e instanceof w ? this._withLocalTimeOffset(this._time.plus(t, e), this._offset) : e.addTo(this, t)
        }, i.plusHours = function(t) {
            return this._withLocalTimeOffset(this._time.plusHours(t), this._offset)
        }, i.plusMinutes = function(t) {
            return this._withLocalTimeOffset(this._time.plusMinutes(t), this._offset)
        }, i.plusSeconds = function(t) {
            return this._withLocalTimeOffset(this._time.plusSeconds(t), this._offset)
        }, i.plusNanos = function(t) {
            return this._withLocalTimeOffset(this._time.plusNanos(t), this._offset)
        }, i.query = function(e) {
            return _(e, "query"), e === g.precision() ? w.NANOS : e === g.offset() || e === g.zone() ? this.offset() : e === g.localTime() ? this._time : e === g.chronology() || e === g.localDate() || e === g.zoneId() ? null : t.prototype.query.call(this, e)
        }, i.range = function(t) {
            return t instanceof R ? t === R.OFFSET_SECONDS ? t.range() : this._time.range(t) : t.rangeRefinedBy(this)
        }, i.toLocalTime = function() {
            return this._time
        }, i.truncatedTo = function(t) {
            return this._withLocalTimeOffset(this._time.truncatedTo(t), this._offset)
        }, i.until = function(t, n) {
            _(t, "endExclusive"), _(n, "unit");
            var i = e.from(t);
            if (n instanceof w) {
                var s = i._toEpochNano() - this._toEpochNano();
                switch (n) {
                    case w.NANOS:
                        return s;
                    case w.MICROS:
                        return m.intDiv(s, 1e3);
                    case w.MILLIS:
                        return m.intDiv(s, 1e6);
                    case w.SECONDS:
                        return m.intDiv(s, fe.NANOS_PER_SECOND);
                    case w.MINUTES:
                        return m.intDiv(s, fe.NANOS_PER_MINUTE);
                    case w.HOURS:
                        return m.intDiv(s, fe.NANOS_PER_HOUR);
                    case w.HALF_DAYS:
                        return m.intDiv(s, 12 * fe.NANOS_PER_HOUR)
                }
                throw new r("Unsupported unit: " + n)
            }
            return n.between(this, i)
        }, i.withHour = function(t) {
            return this._withLocalTimeOffset(this._time.withHour(t), this._offset)
        }, i.withMinute = function(t) {
            return this._withLocalTimeOffset(this._time.withMinute(t), this._offset)
        }, i.withSecond = function(t) {
            return this._withLocalTimeOffset(this._time.withSecond(t), this._offset)
        }, i.withNano = function(t) {
            return this._withLocalTimeOffset(this._time.withNano(t), this._offset)
        }, i.withOffsetSameInstant = function(t) {
            if (_(t, "offset"), t.equals(this._offset)) return this;
            var n = t.totalSeconds() - this._offset.totalSeconds();
            return new e(this._time.plusSeconds(n), t)
        }, i.withOffsetSameLocal = function(t) {
            return null != t && t.equals(this._offset) ? this : new e(this._time, t)
        }, i._toEpochNano = function() {
            return this._time.toNanoOfDay() - this._offset.totalSeconds() * fe.NANOS_PER_SECOND
        }, i._withAdjuster = function(t) {
            return _(t, "adjuster"), t instanceof fe ? this._withLocalTimeOffset(t, this._offset) : t instanceof X ? this._withLocalTimeOffset(this._time, t) : t instanceof e ? t : t.adjustInto(this)
        }, i._withField = function(t, e) {
            return _(t, "field"), t instanceof R ? t === R.OFFSET_SECONDS ? this._withLocalTimeOffset(this._time, X.ofTotalSeconds(t.checkValidIntValue(e))) : this._withLocalTimeOffset(this._time.with(t, e), this._offset) : t.adjustInto(this, e)
        }, i._withLocalTimeOffset = function(t, n) {
            return this._time === t && this._offset.equals(n) ? this : new e(t, n)
        }, i.compareTo = function(t) {
            if (_(t, "other"), d(t, e, "other"), this._offset.equals(t._offset)) return this._time.compareTo(t._time);
            var n = m.compareNumbers(this._toEpochNano(), t._toEpochNano());
            return 0 === n ? this._time.compareTo(t._time) : n
        }, i.equals = function(t) {
            return this === t || t instanceof e && (this._time.equals(t._time) && this._offset.equals(t._offset))
        }, i.hashCode = function() {
            return this._time.hashCode() ^ this._offset.hashCode()
        }, i.toString = function() {
            return this._time.toString() + this._offset.toString()
        }, i.toJSON = function() {
            return this.toString()
        }, e
    }(k);
    var ne = function(t) {
        function e() {
            return t.apply(this, arguments) || this
        }
        h(e, t);
        var n = e.prototype;
        return n.query = function(e) {
            return e === g.zoneId() || e === g.zone() ? this.zone() : e === g.chronology() ? this.toLocalDate().chronology() : e === g.precision() ? w.NANOS : e === g.offset() ? this.offset() : e === g.localDate() ? ae.ofEpochDay(this.toLocalDate().toEpochDay()) : e === g.localTime() ? this.toLocalTime() : t.prototype.query.call(this, e)
        }, n.format = function(t) {
            return _(t, "formatter"), t.format(this)
        }, n.toInstant = function() {
            return le.ofEpochSecond(this.toEpochSecond(), this.toLocalTime().nano())
        }, n.toEpochSecond = function() {
            var t = 86400 * this.toLocalDate().toEpochDay() + this.toLocalTime().toSecondOfDay();
            return t -= this.offset().totalSeconds()
        }, n.compareTo = function(t) {
            _(t, "other");
            var e = m.compareNumbers(this.toEpochSecond(), t.toEpochSecond());
            return 0 === e && 0 === (e = this.toLocalTime().nano() - t.toLocalTime().nano()) && 0 === (e = this.toLocalDateTime().compareTo(t.toLocalDateTime())) && (e = function(t, e) {
                if (t < e) return -1;
                if (t > e) return 1;
                return 0
            }(this.zone().id(), t.zone().id())), e
        }, n.isAfter = function(t) {
            _(t, "other");
            var e = this.toEpochSecond(),
                n = t.toEpochSecond();
            return e > n || e === n && this.toLocalTime().nano() > t.toLocalTime().nano()
        }, n.isBefore = function(t) {
            _(t, "other");
            var e = this.toEpochSecond(),
                n = t.toEpochSecond();
            return e < n || e === n && this.toLocalTime().nano() < t.toLocalTime().nano()
        }, n.isEqual = function(t) {
            return _(t, "other"), this.toEpochSecond() === t.toEpochSecond() && this.toLocalTime().nano() === t.toLocalTime().nano()
        }, n.equals = function(t) {
            return this === t || t instanceof e && 0 === this.compareTo(t)
        }, e
    }(k);
    var ie = function(t) {
        function e(e, n, i) {
            var r;
            return _(e, "dateTime"), _(n, "offset"), _(i, "zone"), (r = t.call(this) || this)._dateTime = e, r._offset = n, r._zone = i, r
        }
        h(e, t), e.now = function(t) {
            var n;
            return n = t instanceof Z ? _e.system(t) : null == t ? _e.systemDefaultZone() : t, e.ofInstant(n.instant(), n.zone())
        }, e.of = function() {
            return arguments.length <= 2 ? e.of2.apply(this, arguments) : 3 === arguments.length && arguments[0] instanceof ae ? e.of3.apply(this, arguments) : e.of8.apply(this, arguments)
        }, e.of3 = function(t, n, i) {
            return e.of2(he.of(t, n), i)
        }, e.of2 = function(t, n) {
            return e.ofLocal(t, n, null)
        }, e.of8 = function(t, n, i, r, s, o, a, u) {
            var h = he.of(t, n, i, r, s, o, a);
            return e.ofLocal(h, u, null)
        }, e.ofLocal = function(t, n, i) {
            if (_(t, "localDateTime"), _(n, "zone"), n instanceof X) return new e(t, n, n);
            var r = null,
                s = n.rules(),
                o = s.validOffsets(t);
            if (1 === o.length) r = o[0];
            else if (0 === o.length) {
                var a = s.transition(t);
                t = t.plusSeconds(a.duration().seconds()), r = a.offsetAfter()
            } else r = null != i && o.some((function(t) {
                return t.equals(i)
            })) ? i : _(o[0], "offset");
            return new e(t, r, n)
        }, e.ofInstant = function() {
            return 2 === arguments.length ? e.ofInstant2.apply(this, arguments) : e.ofInstant3.apply(this, arguments)
        }, e.ofInstant2 = function(t, n) {
            return _(t, "instant"), _(n, "zone"), e._create(t.epochSecond(), t.nano(), n)
        }, e.ofInstant3 = function(t, n, i) {
            return _(t, "localDateTime"), _(n, "offset"), _(i, "zone"), e._create(t.toEpochSecond(n), t.nano(), i)
        }, e._create = function(t, n, i) {
            var r = i.rules(),
                s = le.ofEpochSecond(t, n),
                o = r.offset(s);
            return new e(he.ofEpochSecond(t, n, o), o, i)
        }, e.ofStrict = function(t, i, r) {
            _(t, "localDateTime"), _(i, "offset"), _(r, "zone");
            var s = r.rules();
            if (!1 === s.isValidOffset(t, i)) {
                var o = s.transition(t);
                if (null != o && o.isGap()) throw new n("LocalDateTime " + t + " does not exist in zone " + r + " due to a gap in the local time-line, typically caused by daylight savings");
                throw new n('ZoneOffset "' + i + '" is not valid for LocalDateTime "' + t + '" in zone "' + r + '"')
            }
            return new e(t, i, r)
        }, e.ofLenient = function(t, n, i) {
            if (_(t, "localDateTime"), _(n, "offset"), _(i, "zone"), i instanceof X && !1 === n.equals(i)) throw new o("ZoneId must match ZoneOffset");
            return new e(t, n, i)
        }, e.from = function(t) {
            if (_(t, "temporal"), t instanceof e) return t;
            var n = Z.from(t);
            if (t.isSupported(R.INSTANT_SECONDS)) {
                var i = e._from(t, n);
                if (null != i) return i
            }
            var r = he.from(t);
            return e.of2(r, n)
        }, e._from = function(t, i) {
            try {
                return e.__from(t, i)
            } catch (t) {
                if (!(t instanceof n)) throw t
            }
        }, e.__from = function(t, n) {
            var i = t.getLong(R.INSTANT_SECONDS),
                r = t.get(R.NANO_OF_SECOND);
            return e._create(i, r, n)
        }, e.parse = function(t, n) {
            return void 0 === n && (n = kt.ISO_ZONED_DATE_TIME), _(n, "formatter"), n.parse(t, e.FROM)
        };
        var i = e.prototype;
        return i._resolveLocal = function(t) {
            return _(t, "newDateTime"), e.ofLocal(t, this._zone, this._offset)
        }, i._resolveInstant = function(t) {
            return e.ofInstant3(t, this._offset, this._zone)
        }, i._resolveOffset = function(t) {
            return !1 === t.equals(this._offset) && this._zone.rules().isValidOffset(this._dateTime, t) ? new e(this._dateTime, t, this._zone) : this
        }, i.isSupported = function(t) {
            return t instanceof R || (t instanceof w ? t.isDateBased() || t.isTimeBased() : null != t && t.isSupportedBy(this))
        }, i.range = function(t) {
            return t instanceof R ? t === R.INSTANT_SECONDS || t === R.OFFSET_SECONDS ? t.range() : this._dateTime.range(t) : t.rangeRefinedBy(this)
        }, i.get = function(t) {
            return this.getLong(t)
        }, i.getLong = function(t) {
            if (t instanceof R) {
                switch (t) {
                    case R.INSTANT_SECONDS:
                        return this.toEpochSecond();
                    case R.OFFSET_SECONDS:
                        return this._offset.totalSeconds()
                }
                return this._dateTime.getLong(t)
            }
            return _(t, "field"), t.getFrom(this)
        }, i.offset = function() {
            return this._offset
        }, i.withEarlierOffsetAtOverlap = function() {
            var t = this._zone.rules().transition(this._dateTime);
            if (null != t && t.isOverlap()) {
                var n = t.offsetBefore();
                if (!1 === n.equals(this._offset)) return new e(this._dateTime, n, this._zone)
            }
            return this
        }, i.withLaterOffsetAtOverlap = function() {
            var t = this._zone.rules().transition(this.toLocalDateTime());
            if (null != t) {
                var n = t.offsetAfter();
                if (!1 === n.equals(this._offset)) return new e(this._dateTime, n, this._zone)
            }
            return this
        }, i.zone = function() {
            return this._zone
        }, i.withZoneSameLocal = function(t) {
            return _(t, "zone"), this._zone.equals(t) ? this : e.ofLocal(this._dateTime, t, this._offset)
        }, i.withZoneSameInstant = function(t) {
            return _(t, "zone"), this._zone.equals(t) ? this : e._create(this._dateTime.toEpochSecond(this._offset), this._dateTime.nano(), t)
        }, i.withFixedOffsetZone = function() {
            return this._zone.equals(this._offset) ? this : new e(this._dateTime, this._offset, this._offset)
        }, i.year = function() {
            return this._dateTime.year()
        }, i.monthValue = function() {
            return this._dateTime.monthValue()
        }, i.month = function() {
            return this._dateTime.month()
        }, i.dayOfMonth = function() {
            return this._dateTime.dayOfMonth()
        }, i.dayOfYear = function() {
            return this._dateTime.dayOfYear()
        }, i.dayOfWeek = function() {
            return this._dateTime.dayOfWeek()
        }, i.hour = function() {
            return this._dateTime.hour()
        }, i.minute = function() {
            return this._dateTime.minute()
        }, i.second = function() {
            return this._dateTime.second()
        }, i.nano = function() {
            return this._dateTime.nano()
        }, i._withAdjuster = function(n) {
            if (n instanceof ae) return this._resolveLocal(he.of(n, this._dateTime.toLocalTime()));
            if (n instanceof fe) return this._resolveLocal(he.of(this._dateTime.toLocalDate(), n));
            if (n instanceof he) return this._resolveLocal(n);
            if (n instanceof le) {
                var i = n;
                return e._create(i.epochSecond(), i.nano(), this._zone)
            }
            return n instanceof X ? this._resolveOffset(n) : t.prototype._withAdjuster.call(this, n)
        }, i._withField = function(t, n) {
            if (t instanceof R) {
                switch (t) {
                    case R.INSTANT_SECONDS:
                        return e._create(n, this.nano(), this._zone);
                    case R.OFFSET_SECONDS:
                        var i = X.ofTotalSeconds(t.checkValidIntValue(n));
                        return this._resolveOffset(i)
                }
                return this._resolveLocal(this._dateTime.with(t, n))
            }
            return t.adjustInto(this, n)
        }, i.withYear = function(t) {
            return this._resolveLocal(this._dateTime.withYear(t))
        }, i.withMonth = function(t) {
            return this._resolveLocal(this._dateTime.withMonth(t))
        }, i.withDayOfMonth = function(t) {
            return this._resolveLocal(this._dateTime.withDayOfMonth(t))
        }, i.withDayOfYear = function(t) {
            return this._resolveLocal(this._dateTime.withDayOfYear(t))
        }, i.withHour = function(t) {
            return this._resolveLocal(this._dateTime.withHour(t))
        }, i.withMinute = function(t) {
            return this._resolveLocal(this._dateTime.withMinute(t))
        }, i.withSecond = function(t) {
            return this._resolveLocal(this._dateTime.withSecond(t))
        }, i.withNano = function(t) {
            return this._resolveLocal(this._dateTime.withNano(t))
        }, i.truncatedTo = function(t) {
            return this._resolveLocal(this._dateTime.truncatedTo(t))
        }, i._plusUnit = function(t, e) {
            return e instanceof w ? e.isDateBased() ? this._resolveLocal(this._dateTime.plus(t, e)) : this._resolveInstant(this._dateTime.plus(t, e)) : (_(e, "unit"), e.addTo(this, t))
        }, i.plusYears = function(t) {
            return this._resolveLocal(this._dateTime.plusYears(t))
        }, i.plusMonths = function(t) {
            return this._resolveLocal(this._dateTime.plusMonths(t))
        }, i.plusWeeks = function(t) {
            return this._resolveLocal(this._dateTime.plusWeeks(t))
        }, i.plusDays = function(t) {
            return this._resolveLocal(this._dateTime.plusDays(t))
        }, i.plusHours = function(t) {
            return this._resolveInstant(this._dateTime.plusHours(t))
        }, i.plusMinutes = function(t) {
            return this._resolveInstant(this._dateTime.plusMinutes(t))
        }, i.plusSeconds = function(t) {
            return this._resolveInstant(this._dateTime.plusSeconds(t))
        }, i.plusNanos = function(t) {
            return this._resolveInstant(this._dateTime.plusNanos(t))
        }, i._minusUnit = function(t, e) {
            return this._plusUnit(-1 * t, e)
        }, i.minusYears = function(t) {
            return this.plusYears(-1 * t)
        }, i.minusMonths = function(t) {
            return this.plusMonths(-1 * t)
        }, i.minusWeeks = function(t) {
            return this.plusWeeks(-1 * t)
        }, i.minusDays = function(t) {
            return this.plusDays(-1 * t)
        }, i.minusHours = function(t) {
            return this.plusHours(-1 * t)
        }, i.minusMinutes = function(t) {
            return this.plusMinutes(-1 * t)
        }, i.minusSeconds = function(t) {
            return this.plusSeconds(-1 * t)
        }, i.minusNanos = function(t) {
            return this.plusNanos(-1 * t)
        }, i.query = function(e) {
            return e === g.localDate() ? this.toLocalDate() : (_(e, "query"), t.prototype.query.call(this, e))
        }, i.until = function(t, n) {
            var i = e.from(t);
            if (n instanceof w) {
                if (i = i.withZoneSameInstant(this._zone), n.isDateBased()) return this._dateTime.until(i._dateTime, n);
                var r = this._offset.totalSeconds() - i._offset.totalSeconds(),
                    s = i._dateTime.plusSeconds(r);
                return this._dateTime.until(s, n)
            }
            return n.between(this, i)
        }, i.toLocalDateTime = function() {
            return this._dateTime
        }, i.toLocalDate = function() {
            return this._dateTime.toLocalDate()
        }, i.toLocalTime = function() {
            return this._dateTime.toLocalTime()
        }, i.toOffsetDateTime = function() {
            return re.of(this._dateTime, this._offset)
        }, i.equals = function(t) {
            return this === t || t instanceof e && (this._dateTime.equals(t._dateTime) && this._offset.equals(t._offset) && this._zone.equals(t._zone))
        }, i.hashCode = function() {
            return m.hashCode(this._dateTime.hashCode(), this._offset.hashCode(), this._zone.hashCode())
        }, i.toString = function() {
            var t = this._dateTime.toString() + this._offset.toString();
            return this._offset !== this._zone && (t += "[" + this._zone.toString() + "]"), t
        }, i.toJSON = function() {
            return this.toString()
        }, i.format = function(e) {
            return t.prototype.format.call(this, e)
        }, e
    }(ne);
    var re = function(t) {
        function e(e, n) {
            var i;
            return i = t.call(this) || this, _(e, "dateTime"), d(e, he, "dateTime"), _(n, "offset"), d(n, X, "offset"), i._dateTime = e, i._offset = n, i
        }
        h(e, t), e.from = function(t) {
            if (_(t, "temporal"), t instanceof e) return t;
            try {
                var i = X.from(t);
                try {
                    var r = he.from(t);
                    return e.of(r, i)
                } catch (n) {
                    var s = le.from(t);
                    return e.ofInstant(s, i)
                }
            } catch (e) {
                throw new n("Unable to obtain OffsetDateTime TemporalAccessor: " + t + ", type " + (null != t.constructor ? t.constructor.name : ""))
            }
        }, e.now = function(t) {
            if (0 === arguments.length) return e.now(_e.systemDefaultZone());
            if (_(t, "clockOrZone"), t instanceof Z) return e.now(_e.system(t));
            if (t instanceof _e) {
                var n = t.instant();
                return e.ofInstant(n, t.zone().rules().offset(n))
            }
            throw new o("clockOrZone must be an instance of ZoneId or Clock")
        }, e.of = function() {
            return arguments.length <= 2 ? e.ofDateTime.apply(this, arguments) : 3 === arguments.length ? e.ofDateAndTime.apply(this, arguments) : e.ofNumbers.apply(this, arguments)
        }, e.ofDateTime = function(t, n) {
            return new e(t, n)
        }, e.ofDateAndTime = function(t, n, i) {
            return new e(he.of(t, n), i)
        }, e.ofNumbers = function(t, n, i, r, s, o, a, u) {
            return void 0 === r && (r = 0), void 0 === s && (s = 0), void 0 === o && (o = 0), void 0 === a && (a = 0), new e(he.of(t, n, i, r, s, o, a), u)
        }, e.ofInstant = function(t, n) {
            _(t, "instant"), _(n, "zone");
            var i = n.rules().offset(t);
            return new e(he.ofEpochSecond(t.epochSecond(), t.nano(), i), i)
        }, e.parse = function(t, n) {
            return void 0 === n && (n = kt.ISO_OFFSET_DATE_TIME), _(n, "formatter"), n.parse(t, e.FROM)
        };
        var i = e.prototype;
        return i.adjustInto = function(t) {
            return t.with(R.EPOCH_DAY, this.toLocalDate().toEpochDay()).with(R.NANO_OF_DAY, this.toLocalTime().toNanoOfDay()).with(R.OFFSET_SECONDS, this.offset().totalSeconds())
        }, i.until = function(t, n) {
            var i = e.from(t);
            return n instanceof w ? (i = i.withOffsetSameInstant(this._offset), this._dateTime.until(i._dateTime, n)) : n.between(this, i)
        }, i.atZoneSameInstant = function(t) {
            return ie.ofInstant(this._dateTime, this._offset, t)
        }, i.atZoneSimilarLocal = function(t) {
            return ie.ofLocal(this._dateTime, t, this._offset)
        }, i.query = function(e) {
            return _(e, "query"), e === g.chronology() ? te.INSTANCE : e === g.precision() ? w.NANOS : e === g.offset() || e === g.zone() ? this.offset() : e === g.localDate() ? this.toLocalDate() : e === g.localTime() ? this.toLocalTime() : e === g.zoneId() ? null : t.prototype.query.call(this, e)
        }, i.get = function(e) {
            if (e instanceof R) {
                switch (e) {
                    case R.INSTANT_SECONDS:
                        throw new n("Field too large for an int: " + e);
                    case R.OFFSET_SECONDS:
                        return this.offset().totalSeconds()
                }
                return this._dateTime.get(e)
            }
            return t.prototype.get.call(this, e)
        }, i.getLong = function(t) {
            if (t instanceof R) {
                switch (t) {
                    case R.INSTANT_SECONDS:
                        return this.toEpochSecond();
                    case R.OFFSET_SECONDS:
                        return this.offset().totalSeconds()
                }
                return this._dateTime.getLong(t)
            }
            return t.getFrom(this)
        }, i.offset = function() {
            return this._offset
        }, i.year = function() {
            return this._dateTime.year()
        }, i.monthValue = function() {
            return this._dateTime.monthValue()
        }, i.month = function() {
            return this._dateTime.month()
        }, i.dayOfMonth = function() {
            return this._dateTime.dayOfMonth()
        }, i.dayOfYear = function() {
            return this._dateTime.dayOfYear()
        }, i.dayOfWeek = function() {
            return this._dateTime.dayOfWeek()
        }, i.hour = function() {
            return this._dateTime.hour()
        }, i.minute = function() {
            return this._dateTime.minute()
        }, i.second = function() {
            return this._dateTime.second()
        }, i.nano = function() {
            return this._dateTime.nano()
        }, i.toLocalDateTime = function() {
            return this._dateTime
        }, i.toLocalDate = function() {
            return this._dateTime.toLocalDate()
        }, i.toLocalTime = function() {
            return this._dateTime.toLocalTime()
        }, i.toOffsetTime = function() {
            return ee.of(this._dateTime.toLocalTime(), this._offset)
        }, i.toZonedDateTime = function() {
            return ie.of(this._dateTime, this._offset)
        }, i.toInstant = function() {
            return this._dateTime.toInstant(this._offset)
        }, i.toEpochSecond = function() {
            return this._dateTime.toEpochSecond(this._offset)
        }, i.isSupported = function(t) {
            return t instanceof R || t instanceof w ? t.isDateBased() || t.isTimeBased() : null != t && t.isSupportedBy(this)
        }, i.range = function(t) {
            return t instanceof R ? t === R.INSTANT_SECONDS || t === R.OFFSET_SECONDS ? t.range() : this._dateTime.range(t) : t.rangeRefinedBy(this)
        }, i._withAdjuster = function(t) {
            return _(t), t instanceof ae || t instanceof fe || t instanceof he ? this._withDateTimeOffset(this._dateTime.with(t), this._offset) : t instanceof le ? e.ofInstant(t, this._offset) : t instanceof X ? this._withDateTimeOffset(this._dateTime, t) : t instanceof e ? t : t.adjustInto(this)
        }, i._withField = function(t, n) {
            if (_(t), t instanceof R) {
                var i = t;
                switch (i) {
                    case R.INSTANT_SECONDS:
                        return e.ofInstant(le.ofEpochSecond(n, this.nano()), this._offset);
                    case R.OFFSET_SECONDS:
                        return this._withDateTimeOffset(this._dateTime, X.ofTotalSeconds(i.checkValidIntValue(n)))
                }
                return this._withDateTimeOffset(this._dateTime.with(t, n), this._offset)
            }
            return t.adjustInto(this, n)
        }, i._withDateTimeOffset = function(t, n) {
            return this._dateTime === t && this._offset.equals(n) ? this : new e(t, n)
        }, i.withYear = function(t) {
            return this._withDateTimeOffset(this._dateTime.withYear(t), this._offset)
        }, i.withMonth = function(t) {
            return this._withDateTimeOffset(this._dateTime.withMonth(t), this._offset)
        }, i.withDayOfMonth = function(t) {
            return this._withDateTimeOffset(this._dateTime.withDayOfMonth(t), this._offset)
        }, i.withDayOfYear = function(t) {
            return this._withDateTimeOffset(this._dateTime.withDayOfYear(t), this._offset)
        }, i.withHour = function(t) {
            return this._withDateTimeOffset(this._dateTime.withHour(t), this._offset)
        }, i.withMinute = function(t) {
            return this._withDateTimeOffset(this._dateTime.withMinute(t), this._offset)
        }, i.withSecond = function(t) {
            return this._withDateTimeOffset(this._dateTime.withSecond(t), this._offset)
        }, i.withNano = function(t) {
            return this._withDateTimeOffset(this._dateTime.withNano(t), this._offset)
        }, i.withOffsetSameLocal = function(t) {
            return _(t, "offset"), this._withDateTimeOffset(this._dateTime, t)
        }, i.withOffsetSameInstant = function(t) {
            if (_(t, "offset"), t.equals(this._offset)) return this;
            var n = t.totalSeconds() - this._offset.totalSeconds();
            return new e(this._dateTime.plusSeconds(n), t)
        }, i.truncatedTo = function(t) {
            return this._withDateTimeOffset(this._dateTime.truncatedTo(t), this._offset)
        }, i._plusAmount = function(t) {
            return _(t, "amount"), t.addTo(this)
        }, i._plusUnit = function(t, e) {
            return e instanceof w ? this._withDateTimeOffset(this._dateTime.plus(t, e), this._offset) : e.addTo(this, t)
        }, i.plusYears = function(t) {
            return this._withDateTimeOffset(this._dateTime.plusYears(t), this._offset)
        }, i.plusMonths = function(t) {
            return this._withDateTimeOffset(this._dateTime.plusMonths(t), this._offset)
        }, i.plusWeeks = function(t) {
            return this._withDateTimeOffset(this._dateTime.plusWeeks(t), this._offset)
        }, i.plusDays = function(t) {
            return this._withDateTimeOffset(this._dateTime.plusDays(t), this._offset)
        }, i.plusHours = function(t) {
            return this._withDateTimeOffset(this._dateTime.plusHours(t), this._offset)
        }, i.plusMinutes = function(t) {
            return this._withDateTimeOffset(this._dateTime.plusMinutes(t), this._offset)
        }, i.plusSeconds = function(t) {
            return this._withDateTimeOffset(this._dateTime.plusSeconds(t), this._offset)
        }, i.plusNanos = function(t) {
            return this._withDateTimeOffset(this._dateTime.plusNanos(t), this._offset)
        }, i._minusAmount = function(t) {
            return _(t), t.subtractFrom(this)
        }, i._minusUnit = function(t, e) {
            return this.plus(-1 * t, e)
        }, i.minusYears = function(t) {
            return this._withDateTimeOffset(this._dateTime.minusYears(t), this._offset)
        }, i.minusMonths = function(t) {
            return this._withDateTimeOffset(this._dateTime.minusMonths(t), this._offset)
        }, i.minusWeeks = function(t) {
            return this._withDateTimeOffset(this._dateTime.minusWeeks(t), this._offset)
        }, i.minusDays = function(t) {
            return this._withDateTimeOffset(this._dateTime.minusDays(t), this._offset)
        }, i.minusHours = function(t) {
            return this._withDateTimeOffset(this._dateTime.minusHours(t), this._offset)
        }, i.minusMinutes = function(t) {
            return this._withDateTimeOffset(this._dateTime.minusMinutes(t), this._offset)
        }, i.minusSeconds = function(t) {
            return this._withDateTimeOffset(this._dateTime.minusSeconds(t), this._offset)
        }, i.minusNanos = function(t) {
            return this._withDateTimeOffset(this._dateTime.minusNanos(t), this._offset)
        }, i.compareTo = function(t) {
            if (_(t, "other"), d(t, e, "other"), this.offset().equals(t.offset())) return this.toLocalDateTime().compareTo(t.toLocalDateTime());
            var n = m.compareNumbers(this.toEpochSecond(), t.toEpochSecond());
            return 0 === n && 0 === (n = this.toLocalTime().nano() - t.toLocalTime().nano()) && (n = this.toLocalDateTime().compareTo(t.toLocalDateTime())), n
        }, i.isAfter = function(t) {
            _(t, "other");
            var e = this.toEpochSecond(),
                n = t.toEpochSecond();
            return e > n || e === n && this.toLocalTime().nano() > t.toLocalTime().nano()
        }, i.isBefore = function(t) {
            _(t, "other");
            var e = this.toEpochSecond(),
                n = t.toEpochSecond();
            return e < n || e === n && this.toLocalTime().nano() < t.toLocalTime().nano()
        }, i.isEqual = function(t) {
            return _(t, "other"), this.toEpochSecond() === t.toEpochSecond() && this.toLocalTime().nano() === t.toLocalTime().nano()
        }, i.equals = function(t) {
            return this === t || t instanceof e && (this._dateTime.equals(t._dateTime) && this._offset.equals(t._offset))
        }, i.hashCode = function() {
            return this._dateTime.hashCode() ^ this._offset.hashCode()
        }, i.toString = function() {
            return this._dateTime.toString() + this._offset.toString()
        }, i.toJSON = function() {
            return this.toString()
        }, i.format = function(t) {
            return _(t, "formatter"), t.format(this)
        }, e
    }(k);
    var se = 146097,
        oe = 719528,
        ae = function(t) {
            function e(n, i, r) {
                var s;
                return s = t.call(this) || this, _(n, "year"), _(i, "month"), _(r, "dayOfMonth"), i instanceof U && (i = i.value()), s._year = m.safeToInt(n), s._month = m.safeToInt(i), s._day = m.safeToInt(r), e._validate(s._year, s._month, s._day), s
            }
            h(e, t), e.now = function(t) {
                var n;
                return n = null == t ? _e.systemDefaultZone() : t instanceof Z ? _e.system(t) : t, e.ofInstant(n.instant(), n.zone())
            }, e.ofInstant = function(t, n) {
                void 0 === n && (n = Z.systemDefault()), _(t, "instant");
                var i = n.rules().offset(t),
                    r = t.epochSecond() + i.totalSeconds(),
                    s = m.floorDiv(r, fe.SECONDS_PER_DAY);
                return e.ofEpochDay(s)
            }, e.of = function(t, n, i) {
                return new e(t, n, i)
            }, e.ofYearDay = function(t, i) {
                R.YEAR.checkValidValue(t);
                var r = te.isLeapYear(t);
                366 === i && !1 === r && l(!1, "Invalid date 'DayOfYear 366' as '" + t + "' is not a leap year", n);
                var s = U.of(Math.floor((i - 1) / 31 + 1));
                i > s.firstDayOfYear(r) + s.length(r) - 1 && (s = s.plus(1));
                var o = i - s.firstDayOfYear(r) + 1;
                return new e(t, s.value(), o)
            }, e.ofEpochDay = function(t) {
                var n, i, r, s, o;
                void 0 === t && (t = 0), o = t + oe, n = 0, (o -= 60) < 0 && (n = 400 * (i = m.intDiv(o + 1, se) - 1), o += -i * se), (r = o - (365 * (s = m.intDiv(400 * o + 591, se)) + m.intDiv(s, 4) - m.intDiv(s, 100) + m.intDiv(s, 400))) < 0 && (r = o - (365 * --s + m.intDiv(s, 4) - m.intDiv(s, 100) + m.intDiv(s, 400))), s += n;
                var a = r,
                    u = m.intDiv(5 * a + 2, 153),
                    h = (u + 2) % 12 + 1,
                    f = a - m.intDiv(306 * u + 5, 10) + 1;
                return new e(s += m.intDiv(u, 10), h, f)
            }, e.from = function(t) {
                _(t, "temporal");
                var e = t.query(g.localDate());
                if (null == e) throw new n("Unable to obtain LocalDate from TemporalAccessor: " + t + ", type " + (null != t.constructor ? t.constructor.name : ""));
                return e
            }, e.parse = function(t, n) {
                return void 0 === n && (n = kt.ISO_LOCAL_DATE), l(null != n, "formatter", u), n.parse(t, e.FROM)
            }, e._resolvePreviousValid = function(t, n, i) {
                switch (n) {
                    case 2:
                        i = Math.min(i, te.isLeapYear(t) ? 29 : 28);
                        break;
                    case 4:
                    case 6:
                    case 9:
                    case 11:
                        i = Math.min(i, 30)
                }
                return e.of(t, n, i)
            }, e._validate = function(t, e, i) {
                var r;
                if (R.YEAR.checkValidValue(t), R.MONTH_OF_YEAR.checkValidValue(e), R.DAY_OF_MONTH.checkValidValue(i), i > 28) {
                    switch (r = 31, e) {
                        case 2:
                            r = te.isLeapYear(t) ? 29 : 28;
                            break;
                        case 4:
                        case 6:
                        case 9:
                        case 11:
                            r = 30
                    }
                    i > r && l(!1, 29 === i ? "Invalid date 'February 29' as '" + t + "' is not a leap year" : "Invalid date '" + t + "' '" + e + "' '" + i + "'", n)
                }
            };
            var i = e.prototype;
            return i.isSupported = function(e) {
                return t.prototype.isSupported.call(this, e)
            }, i.range = function(t) {
                if (t instanceof R) {
                    if (t.isDateBased()) {
                        switch (t) {
                            case R.DAY_OF_MONTH:
                                return M.of(1, this.lengthOfMonth());
                            case R.DAY_OF_YEAR:
                                return M.of(1, this.lengthOfYear());
                            case R.ALIGNED_WEEK_OF_MONTH:
                                return M.of(1, this.month() === U.FEBRUARY && !1 === this.isLeapYear() ? 4 : 5);
                            case R.YEAR_OF_ERA:
                                return this._year <= 0 ? M.of(1, jt.MAX_VALUE + 1) : M.of(1, jt.MAX_VALUE)
                        }
                        return t.range()
                    }
                    throw new r("Unsupported field: " + t)
                }
                return t.rangeRefinedBy(this)
            }, i.get = function(t) {
                return this.getLong(t)
            }, i.getLong = function(t) {
                return l(null != t, "", u), t instanceof R ? this._get0(t) : t.getFrom(this)
            }, i._get0 = function(t) {
                switch (t) {
                    case R.DAY_OF_WEEK:
                        return this.dayOfWeek().value();
                    case R.ALIGNED_DAY_OF_WEEK_IN_MONTH:
                        return m.intMod(this._day - 1, 7) + 1;
                    case R.ALIGNED_DAY_OF_WEEK_IN_YEAR:
                        return m.intMod(this.dayOfYear() - 1, 7) + 1;
                    case R.DAY_OF_MONTH:
                        return this._day;
                    case R.DAY_OF_YEAR:
                        return this.dayOfYear();
                    case R.EPOCH_DAY:
                        return this.toEpochDay();
                    case R.ALIGNED_WEEK_OF_MONTH:
                        return m.intDiv(this._day - 1, 7) + 1;
                    case R.ALIGNED_WEEK_OF_YEAR:
                        return m.intDiv(this.dayOfYear() - 1, 7) + 1;
                    case R.MONTH_OF_YEAR:
                        return this._month;
                    case R.PROLEPTIC_MONTH:
                        return this._prolepticMonth();
                    case R.YEAR_OF_ERA:
                        return this._year >= 1 ? this._year : 1 - this._year;
                    case R.YEAR:
                        return this._year;
                    case R.ERA:
                        return this._year >= 1 ? 1 : 0
                }
                throw new r("Unsupported field: " + t)
            }, i._prolepticMonth = function() {
                return 12 * this._year + (this._month - 1)
            }, i.chronology = function() {
                return te.INSTANCE
            }, i.year = function() {
                return this._year
            }, i.monthValue = function() {
                return this._month
            }, i.month = function() {
                return U.of(this._month)
            }, i.dayOfMonth = function() {
                return this._day
            }, i.dayOfYear = function() {
                return this.month().firstDayOfYear(this.isLeapYear()) + this._day - 1
            }, i.dayOfWeek = function() {
                var t = m.floorMod(this.toEpochDay() + 3, 7);
                return L.of(t + 1)
            }, i.isLeapYear = function() {
                return te.isLeapYear(this._year)
            }, i.lengthOfMonth = function() {
                switch (this._month) {
                    case 2:
                        return this.isLeapYear() ? 29 : 28;
                    case 4:
                    case 6:
                    case 9:
                    case 11:
                        return 30;
                    default:
                        return 31
                }
            }, i.lengthOfYear = function() {
                return this.isLeapYear() ? 366 : 365
            }, i._withAdjuster = function(n) {
                return _(n, "adjuster"), n instanceof e ? n : t.prototype._withAdjuster.call(this, n)
            }, i._withField = function(t, n) {
                if (l(null != t, "field", u), t instanceof R) {
                    var i = t;
                    switch (i.checkValidValue(n), i) {
                        case R.DAY_OF_WEEK:
                            return this.plusDays(n - this.dayOfWeek().value());
                        case R.ALIGNED_DAY_OF_WEEK_IN_MONTH:
                            return this.plusDays(n - this.getLong(R.ALIGNED_DAY_OF_WEEK_IN_MONTH));
                        case R.ALIGNED_DAY_OF_WEEK_IN_YEAR:
                            return this.plusDays(n - this.getLong(R.ALIGNED_DAY_OF_WEEK_IN_YEAR));
                        case R.DAY_OF_MONTH:
                            return this.withDayOfMonth(n);
                        case R.DAY_OF_YEAR:
                            return this.withDayOfYear(n);
                        case R.EPOCH_DAY:
                            return e.ofEpochDay(n);
                        case R.ALIGNED_WEEK_OF_MONTH:
                            return this.plusWeeks(n - this.getLong(R.ALIGNED_WEEK_OF_MONTH));
                        case R.ALIGNED_WEEK_OF_YEAR:
                            return this.plusWeeks(n - this.getLong(R.ALIGNED_WEEK_OF_YEAR));
                        case R.MONTH_OF_YEAR:
                            return this.withMonth(n);
                        case R.PROLEPTIC_MONTH:
                            return this.plusMonths(n - this.getLong(R.PROLEPTIC_MONTH));
                        case R.YEAR_OF_ERA:
                            return this.withYear(this._year >= 1 ? n : 1 - n);
                        case R.YEAR:
                            return this.withYear(n);
                        case R.ERA:
                            return this.getLong(R.ERA) === n ? this : this.withYear(1 - this._year)
                    }
                    throw new r("Unsupported field: " + t)
                }
                return t.adjustInto(this, n)
            }, i.withYear = function(t) {
                return this._year === t ? this : (R.YEAR.checkValidValue(t), e._resolvePreviousValid(t, this._month, this._day))
            }, i.withMonth = function(t) {
                var n = t instanceof U ? t.value() : t;
                return this._month === n ? this : (R.MONTH_OF_YEAR.checkValidValue(n), e._resolvePreviousValid(this._year, n, this._day))
            }, i.withDayOfMonth = function(t) {
                return this._day === t ? this : e.of(this._year, this._month, t)
            }, i.withDayOfYear = function(t) {
                return this.dayOfYear() === t ? this : e.ofYearDay(this._year, t)
            }, i._plusUnit = function(t, e) {
                if (_(t, "amountToAdd"), _(e, "unit"), e instanceof w) {
                    switch (e) {
                        case w.DAYS:
                            return this.plusDays(t);
                        case w.WEEKS:
                            return this.plusWeeks(t);
                        case w.MONTHS:
                            return this.plusMonths(t);
                        case w.YEARS:
                            return this.plusYears(t);
                        case w.DECADES:
                            return this.plusYears(m.safeMultiply(t, 10));
                        case w.CENTURIES:
                            return this.plusYears(m.safeMultiply(t, 100));
                        case w.MILLENNIA:
                            return this.plusYears(m.safeMultiply(t, 1e3));
                        case w.ERAS:
                            return this.with(R.ERA, m.safeAdd(this.getLong(R.ERA), t))
                    }
                    throw new r("Unsupported unit: " + e)
                }
                return e.addTo(this, t)
            }, i.plusYears = function(t) {
                if (0 === t) return this;
                var n = R.YEAR.checkValidIntValue(this._year + t);
                return e._resolvePreviousValid(n, this._month, this._day)
            }, i.plusMonths = function(t) {
                if (0 === t) return this;
                var n = 12 * this._year + (this._month - 1) + t,
                    i = R.YEAR.checkValidIntValue(m.floorDiv(n, 12)),
                    r = m.floorMod(n, 12) + 1;
                return e._resolvePreviousValid(i, r, this._day)
            }, i.plusWeeks = function(t) {
                return this.plusDays(m.safeMultiply(t, 7))
            }, i.plusDays = function(t) {
                if (0 === t) return this;
                var n = m.safeAdd(this.toEpochDay(), t);
                return e.ofEpochDay(n)
            }, i._minusUnit = function(t, e) {
                return _(t, "amountToSubtract"), _(e, "unit"), this._plusUnit(-1 * t, e)
            }, i.minusYears = function(t) {
                return this.plusYears(-1 * t)
            }, i.minusMonths = function(t) {
                return this.plusMonths(-1 * t)
            }, i.minusWeeks = function(t) {
                return this.plusWeeks(-1 * t)
            }, i.minusDays = function(t) {
                return this.plusDays(-1 * t)
            }, i.query = function(e) {
                return _(e, "query"), e === g.localDate() ? this : t.prototype.query.call(this, e)
            }, i.adjustInto = function(e) {
                return t.prototype.adjustInto.call(this, e)
            }, i.until = function(t, e) {
                return arguments.length < 2 ? this.until1(t) : this.until2(t, e)
            }, i.until2 = function(t, n) {
                var i = e.from(t);
                if (n instanceof w) {
                    switch (n) {
                        case w.DAYS:
                            return this.daysUntil(i);
                        case w.WEEKS:
                            return m.intDiv(this.daysUntil(i), 7);
                        case w.MONTHS:
                            return this._monthsUntil(i);
                        case w.YEARS:
                            return m.intDiv(this._monthsUntil(i), 12);
                        case w.DECADES:
                            return m.intDiv(this._monthsUntil(i), 120);
                        case w.CENTURIES:
                            return m.intDiv(this._monthsUntil(i), 1200);
                        case w.MILLENNIA:
                            return m.intDiv(this._monthsUntil(i), 12e3);
                        case w.ERAS:
                            return i.getLong(R.ERA) - this.getLong(R.ERA)
                    }
                    throw new r("Unsupported unit: " + n)
                }
                return n.between(this, i)
            }, i.daysUntil = function(t) {
                return t.toEpochDay() - this.toEpochDay()
            }, i._monthsUntil = function(t) {
                var e = 32 * this._prolepticMonth() + this.dayOfMonth(),
                    n = 32 * t._prolepticMonth() + t.dayOfMonth();
                return m.intDiv(n - e, 32)
            }, i.until1 = function(t) {
                var n = e.from(t),
                    i = n._prolepticMonth() - this._prolepticMonth(),
                    r = n._day - this._day;
                if (i > 0 && r < 0) {
                    i--;
                    var s = this.plusMonths(i);
                    r = n.toEpochDay() - s.toEpochDay()
                } else i < 0 && r > 0 && (i++, r -= n.lengthOfMonth());
                var o = m.intDiv(i, 12),
                    a = m.intMod(i, 12);
                return b.of(o, a, r)
            }, i.atTime = function() {
                return 1 === arguments.length ? this.atTime1.apply(this, arguments) : this.atTime4.apply(this, arguments)
            }, i.atTime1 = function(t) {
                if (_(t, "time"), t instanceof fe) return he.of(this, t);
                if (t instanceof ee) return this._atTimeOffsetTime(t);
                throw new o("time must be an instance of LocalTime or OffsetTime" + (t && t.constructor && t.constructor.name ? ", but is " + t.constructor.name : ""))
            }, i.atTime4 = function(t, e, n, i) {
                return void 0 === n && (n = 0), void 0 === i && (i = 0), this.atTime1(fe.of(t, e, n, i))
            }, i._atTimeOffsetTime = function(t) {
                return re.of(he.of(this, t.toLocalTime()), t.offset())
            }, i.atStartOfDay = function(t) {
                return null != t ? this._atStartOfDayWithZone(t) : he.of(this, fe.MIDNIGHT)
            }, i._atStartOfDayWithZone = function(t) {
                _(t, "zone");
                var e = this.atTime(fe.MIDNIGHT);
                if (t instanceof X == !1) {
                    var n = t.rules().transition(e);
                    null != n && n.isGap() && (e = n.dateTimeAfter())
                }
                return ie.of(e, t)
            }, i.toEpochDay = function() {
                var t = this._year,
                    e = this._month,
                    n = 0;
                return n += 365 * t, t >= 0 ? n += m.intDiv(t + 3, 4) - m.intDiv(t + 99, 100) + m.intDiv(t + 399, 400) : n -= m.intDiv(t, -4) - m.intDiv(t, -100) + m.intDiv(t, -400), n += m.intDiv(367 * e - 362, 12), n += this.dayOfMonth() - 1, e > 2 && (n--, te.isLeapYear(t) || n--), n - oe
            }, i.compareTo = function(t) {
                return _(t, "other"), d(t, e, "other"), this._compareTo0(t)
            }, i._compareTo0 = function(t) {
                var e = this._year - t._year;
                return 0 === e && 0 === (e = this._month - t._month) && (e = this._day - t._day), e
            }, i.isAfter = function(t) {
                return this.compareTo(t) > 0
            }, i.isBefore = function(t) {
                return this.compareTo(t) < 0
            }, i.isEqual = function(t) {
                return 0 === this.compareTo(t)
            }, i.equals = function(t) {
                return this === t || t instanceof e && 0 === this._compareTo0(t)
            }, i.hashCode = function() {
                var t = this._year,
                    e = this._month,
                    n = this._day;
                return m.hash(4294965248 & t ^ (t << 11) + (e << 6) + n)
            }, i.toString = function() {
                var t = this._year,
                    e = this._month,
                    n = this._day;
                return (Math.abs(t) < 1e3 ? t < 0 ? "-" + ("" + (t - 1e4)).slice(-4) : ("" + (t + 1e4)).slice(-4) : t > 9999 ? "+" + t : "" + t) + (e < 10 ? "-0" + e : "-" + e) + (n < 10 ? "-0" + n : "-" + n)
            }, i.toJSON = function() {
                return this.toString()
            }, i.format = function(e) {
                return _(e, "formatter"), d(e, kt, "formatter"), t.prototype.format.call(this, e)
            }, e
        }(B);
    var ue = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t);
            var n = e.prototype;
            return n.chronology = function() {
                return this.toLocalDate().chronology()
            }, n.query = function(e) {
                return e === g.chronology() ? this.chronology() : e === g.precision() ? w.NANOS : e === g.localDate() ? ae.ofEpochDay(this.toLocalDate().toEpochDay()) : e === g.localTime() ? this.toLocalTime() : e === g.zone() || e === g.zoneId() || e === g.offset() ? null : t.prototype.query.call(this, e)
            }, n.adjustInto = function(t) {
                return t.with(R.EPOCH_DAY, this.toLocalDate().toEpochDay()).with(R.NANO_OF_DAY, this.toLocalTime().toNanoOfDay())
            }, n.toInstant = function(t) {
                return d(t, X, "zoneId"), le.ofEpochSecond(this.toEpochSecond(t), this.toLocalTime().nano())
            }, n.toEpochSecond = function(t) {
                _(t, "offset");
                var e = 86400 * this.toLocalDate().toEpochDay() + this.toLocalTime().toSecondOfDay();
                return e -= t.totalSeconds(), m.safeToInt(e)
            }, e
        }(k),
        he = function(t) {
            function e(e, n) {
                var i;
                return i = t.call(this) || this, d(e, ae, "date"), d(n, fe, "time"), i._date = e, i._time = n, i
            }
            h(e, t), e.now = function(t) {
                return null == t ? e._now(_e.systemDefaultZone()) : t instanceof _e ? e._now(t) : e._now(_e.system(t))
            }, e._now = function(t) {
                return _(t, "clock"), e.ofInstant(t.instant(), t.zone())
            }, e._ofEpochMillis = function(t, n) {
                var i = m.floorDiv(t, 1e3) + n.totalSeconds(),
                    r = m.floorDiv(i, fe.SECONDS_PER_DAY),
                    s = m.floorMod(i, fe.SECONDS_PER_DAY),
                    o = 1e6 * m.floorMod(t, 1e3);
                return new e(ae.ofEpochDay(r), fe.ofSecondOfDay(s, o))
            }, e.of = function() {
                return arguments.length <= 2 ? e.ofDateAndTime.apply(this, arguments) : e.ofNumbers.apply(this, arguments)
            }, e.ofNumbers = function(t, n, i, r, s, o, a) {
                return void 0 === r && (r = 0), void 0 === s && (s = 0), void 0 === o && (o = 0), void 0 === a && (a = 0), new e(ae.of(t, n, i), fe.of(r, s, o, a))
            }, e.ofDateAndTime = function(t, n) {
                return _(t, "date"), _(n, "time"), new e(t, n)
            }, e.ofInstant = function(t, n) {
                void 0 === n && (n = Z.systemDefault()), _(t, "instant"), d(t, le, "instant"), _(n, "zone");
                var i = n.rules().offset(t);
                return e.ofEpochSecond(t.epochSecond(), t.nano(), i)
            }, e.ofEpochSecond = function(t, n, i) {
                void 0 === t && (t = 0), void 0 === n && (n = 0), 2 === arguments.length && n instanceof X && (i = n, n = 0), _(i, "offset");
                var r = t + i.totalSeconds(),
                    s = m.floorDiv(r, fe.SECONDS_PER_DAY),
                    o = m.floorMod(r, fe.SECONDS_PER_DAY),
                    a = ae.ofEpochDay(s),
                    u = fe.ofSecondOfDay(o, n);
                return new e(a, u)
            }, e.from = function(t) {
                if (_(t, "temporal"), t instanceof e) return t;
                if (t instanceof ie) return t.toLocalDateTime();
                try {
                    return new e(ae.from(t), fe.from(t))
                } catch (e) {
                    throw new n("Unable to obtain LocalDateTime TemporalAccessor: " + t + ", type " + (null != t.constructor ? t.constructor.name : ""))
                }
            }, e.parse = function(t, n) {
                return void 0 === n && (n = kt.ISO_LOCAL_DATE_TIME), _(n, "formatter"), n.parse(t, e.FROM)
            };
            var i = e.prototype;
            return i._withDateTime = function(t, n) {
                return this._date.equals(t) && this._time.equals(n) ? this : new e(t, n)
            }, i.isSupported = function(t) {
                return t instanceof R || t instanceof w ? t.isDateBased() || t.isTimeBased() : null != t && t.isSupportedBy(this)
            }, i.range = function(t) {
                return t instanceof R ? t.isTimeBased() ? this._time.range(t) : this._date.range(t) : t.rangeRefinedBy(this)
            }, i.get = function(e) {
                return e instanceof R ? e.isTimeBased() ? this._time.get(e) : this._date.get(e) : t.prototype.get.call(this, e)
            }, i.getLong = function(t) {
                return _(t, "field"), t instanceof R ? t.isTimeBased() ? this._time.getLong(t) : this._date.getLong(t) : t.getFrom(this)
            }, i.year = function() {
                return this._date.year()
            }, i.monthValue = function() {
                return this._date.monthValue()
            }, i.month = function() {
                return this._date.month()
            }, i.dayOfMonth = function() {
                return this._date.dayOfMonth()
            }, i.dayOfYear = function() {
                return this._date.dayOfYear()
            }, i.dayOfWeek = function() {
                return this._date.dayOfWeek()
            }, i.hour = function() {
                return this._time.hour()
            }, i.minute = function() {
                return this._time.minute()
            }, i.second = function() {
                return this._time.second()
            }, i.nano = function() {
                return this._time.nano()
            }, i._withAdjuster = function(n) {
                return _(n, "adjuster"), n instanceof ae ? this._withDateTime(n, this._time) : n instanceof fe ? this._withDateTime(this._date, n) : n instanceof e ? n : t.prototype._withAdjuster.call(this, n)
            }, i._withField = function(t, e) {
                return _(t, "field"), t instanceof R ? t.isTimeBased() ? this._withDateTime(this._date, this._time.with(t, e)) : this._withDateTime(this._date.with(t, e), this._time) : t.adjustInto(this, e)
            }, i.withYear = function(t) {
                return this._withDateTime(this._date.withYear(t), this._time)
            }, i.withMonth = function(t) {
                return this._withDateTime(this._date.withMonth(t), this._time)
            }, i.withDayOfMonth = function(t) {
                return this._withDateTime(this._date.withDayOfMonth(t), this._time)
            }, i.withDayOfYear = function(t) {
                return this._withDateTime(this._date.withDayOfYear(t), this._time)
            }, i.withHour = function(t) {
                var e = this._time.withHour(t);
                return this._withDateTime(this._date, e)
            }, i.withMinute = function(t) {
                var e = this._time.withMinute(t);
                return this._withDateTime(this._date, e)
            }, i.withSecond = function(t) {
                var e = this._time.withSecond(t);
                return this._withDateTime(this._date, e)
            }, i.withNano = function(t) {
                var e = this._time.withNano(t);
                return this._withDateTime(this._date, e)
            }, i.truncatedTo = function(t) {
                return this._withDateTime(this._date, this._time.truncatedTo(t))
            }, i._plusUnit = function(t, e) {
                if (_(e, "unit"), e instanceof w) {
                    switch (e) {
                        case w.NANOS:
                            return this.plusNanos(t);
                        case w.MICROS:
                            return this.plusDays(m.intDiv(t, fe.MICROS_PER_DAY)).plusNanos(1e3 * m.intMod(t, fe.MICROS_PER_DAY));
                        case w.MILLIS:
                            return this.plusDays(m.intDiv(t, fe.MILLIS_PER_DAY)).plusNanos(1e6 * m.intMod(t, fe.MILLIS_PER_DAY));
                        case w.SECONDS:
                            return this.plusSeconds(t);
                        case w.MINUTES:
                            return this.plusMinutes(t);
                        case w.HOURS:
                            return this.plusHours(t);
                        case w.HALF_DAYS:
                            return this.plusDays(m.intDiv(t, 256)).plusHours(12 * m.intMod(t, 256))
                    }
                    return this._withDateTime(this._date.plus(t, e), this._time)
                }
                return e.addTo(this, t)
            }, i.plusYears = function(t) {
                var e = this._date.plusYears(t);
                return this._withDateTime(e, this._time)
            }, i.plusMonths = function(t) {
                var e = this._date.plusMonths(t);
                return this._withDateTime(e, this._time)
            }, i.plusWeeks = function(t) {
                var e = this._date.plusWeeks(t);
                return this._withDateTime(e, this._time)
            }, i.plusDays = function(t) {
                var e = this._date.plusDays(t);
                return this._withDateTime(e, this._time)
            }, i.plusHours = function(t) {
                return this._plusWithOverflow(this._date, t, 0, 0, 0, 1)
            }, i.plusMinutes = function(t) {
                return this._plusWithOverflow(this._date, 0, t, 0, 0, 1)
            }, i.plusSeconds = function(t) {
                return this._plusWithOverflow(this._date, 0, 0, t, 0, 1)
            }, i.plusNanos = function(t) {
                return this._plusWithOverflow(this._date, 0, 0, 0, t, 1)
            }, i._minusUnit = function(t, e) {
                return _(e, "unit"), this._plusUnit(-1 * t, e)
            }, i.minusYears = function(t) {
                return this.plusYears(-1 * t)
            }, i.minusMonths = function(t) {
                return this.plusMonths(-1 * t)
            }, i.minusWeeks = function(t) {
                return this.plusWeeks(-1 * t)
            }, i.minusDays = function(t) {
                return this.plusDays(-1 * t)
            }, i.minusHours = function(t) {
                return this._plusWithOverflow(this._date, t, 0, 0, 0, -1)
            }, i.minusMinutes = function(t) {
                return this._plusWithOverflow(this._date, 0, t, 0, 0, -1)
            }, i.minusSeconds = function(t) {
                return this._plusWithOverflow(this._date, 0, 0, t, 0, -1)
            }, i.minusNanos = function(t) {
                return this._plusWithOverflow(this._date, 0, 0, 0, t, -1)
            }, i._plusWithOverflow = function(t, e, n, i, r, s) {
                if (0 === e && 0 === n && 0 === i && 0 === r) return this._withDateTime(t, this._time);
                var o = m.intDiv(r, fe.NANOS_PER_DAY) + m.intDiv(i, fe.SECONDS_PER_DAY) + m.intDiv(n, fe.MINUTES_PER_DAY) + m.intDiv(e, fe.HOURS_PER_DAY);
                o *= s;
                var a = m.intMod(r, fe.NANOS_PER_DAY) + m.intMod(i, fe.SECONDS_PER_DAY) * fe.NANOS_PER_SECOND + m.intMod(n, fe.MINUTES_PER_DAY) * fe.NANOS_PER_MINUTE + m.intMod(e, fe.HOURS_PER_DAY) * fe.NANOS_PER_HOUR,
                    u = this._time.toNanoOfDay();
                a = a * s + u, o += m.floorDiv(a, fe.NANOS_PER_DAY);
                var h = m.floorMod(a, fe.NANOS_PER_DAY),
                    f = h === u ? this._time : fe.ofNanoOfDay(h);
                return this._withDateTime(t.plusDays(o), f)
            }, i.query = function(e) {
                return _(e, "query"), e === g.localDate() ? this.toLocalDate() : t.prototype.query.call(this, e)
            }, i.adjustInto = function(e) {
                return t.prototype.adjustInto.call(this, e)
            }, i.until = function(t, n) {
                _(t, "endExclusive"), _(n, "unit");
                var i = e.from(t);
                if (n instanceof w) {
                    if (n.isTimeBased()) {
                        var s = this._date.daysUntil(i._date),
                            o = i._time.toNanoOfDay() - this._time.toNanoOfDay();
                        s > 0 && o < 0 ? (s--, o += fe.NANOS_PER_DAY) : s < 0 && o > 0 && (s++, o -= fe.NANOS_PER_DAY);
                        var a = s;
                        switch (n) {
                            case w.NANOS:
                                return a = m.safeMultiply(a, fe.NANOS_PER_DAY), m.safeAdd(a, o);
                            case w.MICROS:
                                return a = m.safeMultiply(a, fe.MICROS_PER_DAY), m.safeAdd(a, m.intDiv(o, 1e3));
                            case w.MILLIS:
                                return a = m.safeMultiply(a, fe.MILLIS_PER_DAY), m.safeAdd(a, m.intDiv(o, 1e6));
                            case w.SECONDS:
                                return a = m.safeMultiply(a, fe.SECONDS_PER_DAY), m.safeAdd(a, m.intDiv(o, fe.NANOS_PER_SECOND));
                            case w.MINUTES:
                                return a = m.safeMultiply(a, fe.MINUTES_PER_DAY), m.safeAdd(a, m.intDiv(o, fe.NANOS_PER_MINUTE));
                            case w.HOURS:
                                return a = m.safeMultiply(a, fe.HOURS_PER_DAY), m.safeAdd(a, m.intDiv(o, fe.NANOS_PER_HOUR));
                            case w.HALF_DAYS:
                                return a = m.safeMultiply(a, 2), m.safeAdd(a, m.intDiv(o, 12 * fe.NANOS_PER_HOUR))
                        }
                        throw new r("Unsupported unit: " + n)
                    }
                    var u = i._date,
                        h = i._time;
                    return u.isAfter(this._date) && h.isBefore(this._time) ? u = u.minusDays(1) : u.isBefore(this._date) && h.isAfter(this._time) && (u = u.plusDays(1)), this._date.until(u, n)
                }
                return n.between(this, i)
            }, i.atOffset = function(t) {
                return re.of(this, t)
            }, i.atZone = function(t) {
                return ie.of(this, t)
            }, i.toLocalDate = function() {
                return this._date
            }, i.toLocalTime = function() {
                return this._time
            }, i.compareTo = function(t) {
                return _(t, "other"), d(t, e, "other"), this._compareTo0(t)
            }, i._compareTo0 = function(t) {
                var e = this._date.compareTo(t.toLocalDate());
                return 0 === e && (e = this._time.compareTo(t.toLocalTime())), e
            }, i.isAfter = function(t) {
                return this.compareTo(t) > 0
            }, i.isBefore = function(t) {
                return this.compareTo(t) < 0
            }, i.isEqual = function(t) {
                return 0 === this.compareTo(t)
            }, i.equals = function(t) {
                return this === t || t instanceof e && (this._date.equals(t._date) && this._time.equals(t._time))
            }, i.hashCode = function() {
                return this._date.hashCode() ^ this._time.hashCode()
            }, i.toString = function() {
                return this._date.toString() + "T" + this._time.toString()
            }, i.toJSON = function() {
                return this.toString()
            }, i.format = function(t) {
                return _(t, "formatter"), t.format(this)
            }, e
        }(ue);
    var fe = function(t) {
        function e(n, i, r, s) {
            var o;
            void 0 === n && (n = 0), void 0 === i && (i = 0), void 0 === r && (r = 0), void 0 === s && (s = 0), o = t.call(this) || this;
            var a = m.safeToInt(n),
                u = m.safeToInt(i),
                h = m.safeToInt(r),
                f = m.safeToInt(s);
            return e._validate(a, u, h, f), 0 === u && 0 === h && 0 === f ? (e.HOURS[a] || (o._hour = a, o._minute = u, o._second = h, o._nano = f, e.HOURS[a] = c(o)), e.HOURS[a] || c(o)) : (o._hour = a, o._minute = u, o._second = h, o._nano = f, o)
        }
        h(e, t), e.now = function(t) {
            return null == t ? e._now(_e.systemDefaultZone()) : t instanceof _e ? e._now(t) : e._now(_e.system(t))
        }, e._now = function(t) {
            return void 0 === t && (t = _e.systemDefaultZone()), _(t, "clock"), e.ofInstant(t.instant(), t.zone())
        }, e.ofInstant = function(t, n) {
            void 0 === n && (n = Z.systemDefault());
            var i = n.rules().offset(t),
                r = m.intMod(t.epochSecond(), e.SECONDS_PER_DAY);
            return (r = m.intMod(r + i.totalSeconds(), e.SECONDS_PER_DAY)) < 0 && (r += e.SECONDS_PER_DAY), e.ofSecondOfDay(r, t.nano())
        }, e.of = function(t, n, i, r) {
            return new e(t, n, i, r)
        }, e.ofSecondOfDay = function(t, n) {
            void 0 === t && (t = 0), void 0 === n && (n = 0), R.SECOND_OF_DAY.checkValidValue(t), R.NANO_OF_SECOND.checkValidValue(n);
            var i = m.intDiv(t, e.SECONDS_PER_HOUR);
            t -= i * e.SECONDS_PER_HOUR;
            var r = m.intDiv(t, e.SECONDS_PER_MINUTE);
            return new e(i, r, t -= r * e.SECONDS_PER_MINUTE, n)
        }, e.ofNanoOfDay = function(t) {
            void 0 === t && (t = 0), R.NANO_OF_DAY.checkValidValue(t);
            var n = m.intDiv(t, e.NANOS_PER_HOUR);
            t -= n * e.NANOS_PER_HOUR;
            var i = m.intDiv(t, e.NANOS_PER_MINUTE);
            t -= i * e.NANOS_PER_MINUTE;
            var r = m.intDiv(t, e.NANOS_PER_SECOND);
            return new e(n, i, r, t -= r * e.NANOS_PER_SECOND)
        }, e.from = function(t) {
            _(t, "temporal");
            var e = t.query(g.localTime());
            if (null == e) throw new n("Unable to obtain LocalTime TemporalAccessor: " + t + ", type " + (null != t.constructor ? t.constructor.name : ""));
            return e
        }, e.parse = function(t, n) {
            return void 0 === n && (n = kt.ISO_LOCAL_TIME), _(n, "formatter"), n.parse(t, e.FROM)
        }, e._validate = function(t, e, n, i) {
            R.HOUR_OF_DAY.checkValidValue(t), R.MINUTE_OF_HOUR.checkValidValue(e), R.SECOND_OF_MINUTE.checkValidValue(n), R.NANO_OF_SECOND.checkValidValue(i)
        };
        var i = e.prototype;
        return i.isSupported = function(t) {
            return t instanceof R || t instanceof w ? t.isTimeBased() : null != t && t.isSupportedBy(this)
        }, i.range = function(e) {
            return _(e), t.prototype.range.call(this, e)
        }, i.get = function(t) {
            return this.getLong(t)
        }, i.getLong = function(t) {
            return _(t, "field"), t instanceof R ? this._get0(t) : t.getFrom(this)
        }, i._get0 = function(t) {
            switch (t) {
                case R.NANO_OF_SECOND:
                    return this._nano;
                case R.NANO_OF_DAY:
                    return this.toNanoOfDay();
                case R.MICRO_OF_SECOND:
                    return m.intDiv(this._nano, 1e3);
                case R.MICRO_OF_DAY:
                    return m.intDiv(this.toNanoOfDay(), 1e3);
                case R.MILLI_OF_SECOND:
                    return m.intDiv(this._nano, 1e6);
                case R.MILLI_OF_DAY:
                    return m.intDiv(this.toNanoOfDay(), 1e6);
                case R.SECOND_OF_MINUTE:
                    return this._second;
                case R.SECOND_OF_DAY:
                    return this.toSecondOfDay();
                case R.MINUTE_OF_HOUR:
                    return this._minute;
                case R.MINUTE_OF_DAY:
                    return 60 * this._hour + this._minute;
                case R.HOUR_OF_AMPM:
                    return m.intMod(this._hour, 12);
                case R.CLOCK_HOUR_OF_AMPM:
                    var e = m.intMod(this._hour, 12);
                    return e % 12 == 0 ? 12 : e;
                case R.HOUR_OF_DAY:
                    return this._hour;
                case R.CLOCK_HOUR_OF_DAY:
                    return 0 === this._hour ? 24 : this._hour;
                case R.AMPM_OF_DAY:
                    return m.intDiv(this._hour, 12)
            }
            throw new r("Unsupported field: " + t)
        }, i.hour = function() {
            return this._hour
        }, i.minute = function() {
            return this._minute
        }, i.second = function() {
            return this._second
        }, i.nano = function() {
            return this._nano
        }, i._withAdjuster = function(n) {
            return _(n, "adjuster"), n instanceof e ? n : t.prototype._withAdjuster.call(this, n)
        }, i._withField = function(t, n) {
            if (_(t, "field"), d(t, y, "field"), t instanceof R) {
                switch (t.checkValidValue(n), t) {
                    case R.NANO_OF_SECOND:
                        return this.withNano(n);
                    case R.NANO_OF_DAY:
                        return e.ofNanoOfDay(n);
                    case R.MICRO_OF_SECOND:
                        return this.withNano(1e3 * n);
                    case R.MICRO_OF_DAY:
                        return e.ofNanoOfDay(1e3 * n);
                    case R.MILLI_OF_SECOND:
                        return this.withNano(1e6 * n);
                    case R.MILLI_OF_DAY:
                        return e.ofNanoOfDay(1e6 * n);
                    case R.SECOND_OF_MINUTE:
                        return this.withSecond(n);
                    case R.SECOND_OF_DAY:
                        return this.plusSeconds(n - this.toSecondOfDay());
                    case R.MINUTE_OF_HOUR:
                        return this.withMinute(n);
                    case R.MINUTE_OF_DAY:
                        return this.plusMinutes(n - (60 * this._hour + this._minute));
                    case R.HOUR_OF_AMPM:
                        return this.plusHours(n - m.intMod(this._hour, 12));
                    case R.CLOCK_HOUR_OF_AMPM:
                        return this.plusHours((12 === n ? 0 : n) - m.intMod(this._hour, 12));
                    case R.HOUR_OF_DAY:
                        return this.withHour(n);
                    case R.CLOCK_HOUR_OF_DAY:
                        return this.withHour(24 === n ? 0 : n);
                    case R.AMPM_OF_DAY:
                        return this.plusHours(12 * (n - m.intDiv(this._hour, 12)))
                }
                throw new r("Unsupported field: " + t)
            }
            return t.adjustInto(this, n)
        }, i.withHour = function(t) {
            return void 0 === t && (t = 0), this._hour === t ? this : new e(t, this._minute, this._second, this._nano)
        }, i.withMinute = function(t) {
            return void 0 === t && (t = 0), this._minute === t ? this : new e(this._hour, t, this._second, this._nano)
        }, i.withSecond = function(t) {
            return void 0 === t && (t = 0), this._second === t ? this : new e(this._hour, this._minute, t, this._nano)
        }, i.withNano = function(t) {
            return void 0 === t && (t = 0), this._nano === t ? this : new e(this._hour, this._minute, this._second, t)
        }, i.truncatedTo = function(t) {
            if (_(t, "unit"), t === w.NANOS) return this;
            var i = t.duration();
            if (i.seconds() > e.SECONDS_PER_DAY) throw new n("Unit is too large to be used for truncation");
            var r = i.toNanos();
            if (0 !== m.intMod(e.NANOS_PER_DAY, r)) throw new n("Unit must divide into a standard day without remainder");
            var s = this.toNanoOfDay();
            return e.ofNanoOfDay(m.intDiv(s, r) * r)
        }, i._plusUnit = function(t, n) {
            if (_(n, "unit"), n instanceof w) {
                switch (n) {
                    case w.NANOS:
                        return this.plusNanos(t);
                    case w.MICROS:
                        return this.plusNanos(1e3 * m.intMod(t, e.MICROS_PER_DAY));
                    case w.MILLIS:
                        return this.plusNanos(1e6 * m.intMod(t, e.MILLIS_PER_DAY));
                    case w.SECONDS:
                        return this.plusSeconds(t);
                    case w.MINUTES:
                        return this.plusMinutes(t);
                    case w.HOURS:
                        return this.plusHours(t);
                    case w.HALF_DAYS:
                        return this.plusHours(12 * m.intMod(t, 2))
                }
                throw new r("Unsupported unit: " + n)
            }
            return n.addTo(this, t)
        }, i.plusHours = function(t) {
            return 0 === t ? this : new e(m.intMod(m.intMod(t, e.HOURS_PER_DAY) + this._hour + e.HOURS_PER_DAY, e.HOURS_PER_DAY), this._minute, this._second, this._nano)
        }, i.plusMinutes = function(t) {
            if (0 === t) return this;
            var n = this._hour * e.MINUTES_PER_HOUR + this._minute,
                i = m.intMod(m.intMod(t, e.MINUTES_PER_DAY) + n + e.MINUTES_PER_DAY, e.MINUTES_PER_DAY);
            return n === i ? this : new e(m.intDiv(i, e.MINUTES_PER_HOUR), m.intMod(i, e.MINUTES_PER_HOUR), this._second, this._nano)
        }, i.plusSeconds = function(t) {
            if (0 === t) return this;
            var n = this._hour * e.SECONDS_PER_HOUR + this._minute * e.SECONDS_PER_MINUTE + this._second,
                i = m.intMod(m.intMod(t, e.SECONDS_PER_DAY) + n + e.SECONDS_PER_DAY, e.SECONDS_PER_DAY);
            return n === i ? this : new e(m.intDiv(i, e.SECONDS_PER_HOUR), m.intMod(m.intDiv(i, e.SECONDS_PER_MINUTE), e.MINUTES_PER_HOUR), m.intMod(i, e.SECONDS_PER_MINUTE), this._nano)
        }, i.plusNanos = function(t) {
            if (0 === t) return this;
            var n = this.toNanoOfDay(),
                i = m.intMod(m.intMod(t, e.NANOS_PER_DAY) + n + e.NANOS_PER_DAY, e.NANOS_PER_DAY);
            return n === i ? this : new e(m.intDiv(i, e.NANOS_PER_HOUR), m.intMod(m.intDiv(i, e.NANOS_PER_MINUTE), e.MINUTES_PER_HOUR), m.intMod(m.intDiv(i, e.NANOS_PER_SECOND), e.SECONDS_PER_MINUTE), m.intMod(i, e.NANOS_PER_SECOND))
        }, i._minusUnit = function(t, e) {
            return _(e, "unit"), this._plusUnit(-1 * t, e)
        }, i.minusHours = function(t) {
            return this.plusHours(-1 * m.intMod(t, e.HOURS_PER_DAY))
        }, i.minusMinutes = function(t) {
            return this.plusMinutes(-1 * m.intMod(t, e.MINUTES_PER_DAY))
        }, i.minusSeconds = function(t) {
            return this.plusSeconds(-1 * m.intMod(t, e.SECONDS_PER_DAY))
        }, i.minusNanos = function(t) {
            return this.plusNanos(-1 * m.intMod(t, e.NANOS_PER_DAY))
        }, i.query = function(t) {
            return _(t, "query"), t === g.precision() ? w.NANOS : t === g.localTime() ? this : t === g.chronology() || t === g.zoneId() || t === g.zone() || t === g.offset() || t === g.localDate() ? null : t.queryFrom(this)
        }, i.adjustInto = function(t) {
            return t.with(e.NANO_OF_DAY, this.toNanoOfDay())
        }, i.until = function(t, n) {
            _(t, "endExclusive"), _(n, "unit");
            var i = e.from(t);
            if (n instanceof w) {
                var s = i.toNanoOfDay() - this.toNanoOfDay();
                switch (n) {
                    case w.NANOS:
                        return s;
                    case w.MICROS:
                        return m.intDiv(s, 1e3);
                    case w.MILLIS:
                        return m.intDiv(s, 1e6);
                    case w.SECONDS:
                        return m.intDiv(s, e.NANOS_PER_SECOND);
                    case w.MINUTES:
                        return m.intDiv(s, e.NANOS_PER_MINUTE);
                    case w.HOURS:
                        return m.intDiv(s, e.NANOS_PER_HOUR);
                    case w.HALF_DAYS:
                        return m.intDiv(s, 12 * e.NANOS_PER_HOUR)
                }
                throw new r("Unsupported unit: " + n)
            }
            return n.between(this, i)
        }, i.atDate = function(t) {
            return he.of(t, this)
        }, i.atOffset = function(t) {
            return ee.of(this, t)
        }, i.toSecondOfDay = function() {
            var t = this._hour * e.SECONDS_PER_HOUR;
            return t += this._minute * e.SECONDS_PER_MINUTE, t += this._second
        }, i.toNanoOfDay = function() {
            var t = this._hour * e.NANOS_PER_HOUR;
            return t += this._minute * e.NANOS_PER_MINUTE, t += this._second * e.NANOS_PER_SECOND, t += this._nano
        }, i.compareTo = function(t) {
            _(t, "other"), d(t, e, "other");
            var n = m.compareNumbers(this._hour, t._hour);
            return 0 === n && 0 === (n = m.compareNumbers(this._minute, t._minute)) && 0 === (n = m.compareNumbers(this._second, t._second)) && (n = m.compareNumbers(this._nano, t._nano)), n
        }, i.isAfter = function(t) {
            return this.compareTo(t) > 0
        }, i.isBefore = function(t) {
            return this.compareTo(t) < 0
        }, i.equals = function(t) {
            return this === t || t instanceof e && (this._hour === t._hour && this._minute === t._minute && this._second === t._second && this._nano === t._nano)
        }, i.hashCode = function() {
            var t = this.toNanoOfDay();
            return m.hash(t)
        }, i.toString = function() {
            var t = "",
                e = this._hour,
                n = this._minute,
                i = this._second,
                r = this._nano;
            return t += e < 10 ? "0" : "", t += e, t += n < 10 ? ":0" : ":", t += n, (i > 0 || r > 0) && (t += i < 10 ? ":0" : ":", t += i, r > 0 && (t += ".", 0 === m.intMod(r, 1e6) ? t += ("" + (m.intDiv(r, 1e6) + 1e3)).substring(1) : 0 === m.intMod(r, 1e3) ? t += ("" + (m.intDiv(r, 1e3) + 1e6)).substring(1) : t += ("" + (r + 1e9)).substring(1))), t
        }, i.toJSON = function() {
            return this.toString()
        }, i.format = function(t) {
            return _(t, "formatter"), t.format(this)
        }, e
    }(k);
    fe.HOURS_PER_DAY = 24, fe.MINUTES_PER_HOUR = 60, fe.MINUTES_PER_DAY = fe.MINUTES_PER_HOUR * fe.HOURS_PER_DAY, fe.SECONDS_PER_MINUTE = 60, fe.SECONDS_PER_HOUR = fe.SECONDS_PER_MINUTE * fe.MINUTES_PER_HOUR, fe.SECONDS_PER_DAY = fe.SECONDS_PER_HOUR * fe.HOURS_PER_DAY, fe.MILLIS_PER_DAY = 1e3 * fe.SECONDS_PER_DAY, fe.MICROS_PER_DAY = 1e6 * fe.SECONDS_PER_DAY, fe.NANOS_PER_SECOND = 1e9, fe.NANOS_PER_MINUTE = fe.NANOS_PER_SECOND * fe.SECONDS_PER_MINUTE, fe.NANOS_PER_HOUR = fe.NANOS_PER_MINUTE * fe.MINUTES_PER_HOUR, fe.NANOS_PER_DAY = fe.NANOS_PER_HOUR * fe.HOURS_PER_DAY;
    var ce = 1e6,
        le = function(t) {
            function e(n, i) {
                var r;
                return r = t.call(this) || this, e._validate(n, i), r._seconds = m.safeToInt(n), r._nanos = m.safeToInt(i), r
            }
            h(e, t), e.now = function(t) {
                return void 0 === t && (t = _e.systemUTC()), t.instant()
            }, e.ofEpochSecond = function(t, n) {
                void 0 === n && (n = 0);
                var i = t + m.floorDiv(n, fe.NANOS_PER_SECOND),
                    r = m.floorMod(n, fe.NANOS_PER_SECOND);
                return e._create(i, r)
            }, e.ofEpochMilli = function(t) {
                var n = m.floorDiv(t, 1e3),
                    i = m.floorMod(t, 1e3);
                return e._create(n, 1e6 * i)
            }, e.ofEpochMicro = function(t) {
                var n = m.floorDiv(t, 1e6),
                    i = m.floorMod(t, 1e6);
                return e._create(n, 1e3 * i)
            }, e.from = function(t) {
                try {
                    var i = t.getLong(R.INSTANT_SECONDS),
                        r = t.get(R.NANO_OF_SECOND);
                    return e.ofEpochSecond(i, r)
                } catch (e) {
                    throw new n("Unable to obtain Instant from TemporalAccessor: " + t + ", type " + typeof t, e)
                }
            }, e.parse = function(t) {
                return kt.ISO_INSTANT.parse(t, e.FROM)
            }, e._create = function(t, n) {
                return 0 === t && 0 === n ? e.EPOCH : new e(t, n)
            }, e._validate = function(t, i) {
                if (t < e.MIN_SECONDS || t > e.MAX_SECONDS) throw new n("Instant exceeds minimum or maximum instant");
                if (i < 0 || i > fe.NANOS_PER_SECOND) throw new n("Instant exceeds minimum or maximum instant")
            };
            var i = e.prototype;
            return i.isSupported = function(t) {
                return t instanceof R ? t === R.INSTANT_SECONDS || t === R.NANO_OF_SECOND || t === R.MICRO_OF_SECOND || t === R.MILLI_OF_SECOND : t instanceof w ? t.isTimeBased() || t === w.DAYS : null != t && t.isSupportedBy(this)
            }, i.range = function(e) {
                return t.prototype.range.call(this, e)
            }, i.get = function(t) {
                return this.getLong(t)
            }, i.getLong = function(t) {
                if (t instanceof R) {
                    switch (t) {
                        case R.NANO_OF_SECOND:
                            return this._nanos;
                        case R.MICRO_OF_SECOND:
                            return m.intDiv(this._nanos, 1e3);
                        case R.MILLI_OF_SECOND:
                            return m.intDiv(this._nanos, ce);
                        case R.INSTANT_SECONDS:
                            return this._seconds
                    }
                    throw new r("Unsupported field: " + t)
                }
                return t.getFrom(this)
            }, i.epochSecond = function() {
                return this._seconds
            }, i.nano = function() {
                return this._nanos
            }, i._withField = function(t, n) {
                if (_(t, "field"), t instanceof R) {
                    switch (t.checkValidValue(n), t) {
                        case R.MILLI_OF_SECOND:
                            var i = n * ce;
                            return i !== this._nanos ? e._create(this._seconds, i) : this;
                        case R.MICRO_OF_SECOND:
                            var s = 1e3 * n;
                            return s !== this._nanos ? e._create(this._seconds, s) : this;
                        case R.NANO_OF_SECOND:
                            return n !== this._nanos ? e._create(this._seconds, n) : this;
                        case R.INSTANT_SECONDS:
                            return n !== this._seconds ? e._create(n, this._nanos) : this
                    }
                    throw new r("Unsupported field: " + t)
                }
                return t.adjustInto(this, n)
            }, i.truncatedTo = function(t) {
                if (_(t, "unit"), t === w.NANOS) return this;
                var e = t.duration();
                if (e.seconds() > fe.SECONDS_PER_DAY) throw new n("Unit is too large to be used for truncation");
                var i = e.toNanos();
                if (0 !== m.intMod(fe.NANOS_PER_DAY, i)) throw new n("Unit must divide into a standard day without remainder");
                var r = m.intMod(this._seconds, fe.SECONDS_PER_DAY) * fe.NANOS_PER_SECOND + this._nanos,
                    s = m.intDiv(r, i) * i;
                return this.plusNanos(s - r)
            }, i._plusUnit = function(t, e) {
                if (_(t, "amountToAdd"), _(e, "unit"), d(e, A), e instanceof w) {
                    switch (e) {
                        case w.NANOS:
                            return this.plusNanos(t);
                        case w.MICROS:
                            return this.plusMicros(t);
                        case w.MILLIS:
                            return this.plusMillis(t);
                        case w.SECONDS:
                            return this.plusSeconds(t);
                        case w.MINUTES:
                            return this.plusSeconds(m.safeMultiply(t, fe.SECONDS_PER_MINUTE));
                        case w.HOURS:
                            return this.plusSeconds(m.safeMultiply(t, fe.SECONDS_PER_HOUR));
                        case w.HALF_DAYS:
                            return this.plusSeconds(m.safeMultiply(t, fe.SECONDS_PER_DAY / 2));
                        case w.DAYS:
                            return this.plusSeconds(m.safeMultiply(t, fe.SECONDS_PER_DAY))
                    }
                    throw new r("Unsupported unit: " + e)
                }
                return e.addTo(this, t)
            }, i.plusSeconds = function(t) {
                return this._plus(t, 0)
            }, i.plusMillis = function(t) {
                return this._plus(m.intDiv(t, 1e3), m.intMod(t, 1e3) * ce)
            }, i.plusNanos = function(t) {
                return this._plus(0, t)
            }, i.plusMicros = function(t) {
                return this._plus(m.intDiv(t, 1e6), 1e3 * m.intMod(t, 1e6))
            }, i._plus = function(t, n) {
                if (0 === t && 0 === n) return this;
                var i = this._seconds + t;
                i += m.intDiv(n, fe.NANOS_PER_SECOND);
                var r = this._nanos + n % fe.NANOS_PER_SECOND;
                return e.ofEpochSecond(i, r)
            }, i._minusUnit = function(t, e) {
                return this._plusUnit(-1 * t, e)
            }, i.minusSeconds = function(t) {
                return this.plusSeconds(-1 * t)
            }, i.minusMillis = function(t) {
                return this.plusMillis(-1 * t)
            }, i.minusNanos = function(t) {
                return this.plusNanos(-1 * t)
            }, i.minusMicros = function(t) {
                return this.plusMicros(-1 * t)
            }, i.query = function(t) {
                return _(t, "query"), t === g.precision() ? w.NANOS : t === g.localDate() || t === g.localTime() || t === g.chronology() || t === g.zoneId() || t === g.zone() || t === g.offset() ? null : t.queryFrom(this)
            }, i.adjustInto = function(t) {
                return _(t, "temporal"), t.with(R.INSTANT_SECONDS, this._seconds).with(R.NANO_OF_SECOND, this._nanos)
            }, i.until = function(t, n) {
                _(t, "endExclusive"), _(n, "unit");
                var i = e.from(t);
                if (n instanceof w) {
                    switch (n) {
                        case w.NANOS:
                            return this._nanosUntil(i);
                        case w.MICROS:
                            return this._microsUntil(i);
                        case w.MILLIS:
                            return m.safeSubtract(i.toEpochMilli(), this.toEpochMilli());
                        case w.SECONDS:
                            return this._secondsUntil(i);
                        case w.MINUTES:
                            return m.intDiv(this._secondsUntil(i), fe.SECONDS_PER_MINUTE);
                        case w.HOURS:
                            return m.intDiv(this._secondsUntil(i), fe.SECONDS_PER_HOUR);
                        case w.HALF_DAYS:
                            return m.intDiv(this._secondsUntil(i), 12 * fe.SECONDS_PER_HOUR);
                        case w.DAYS:
                            return m.intDiv(this._secondsUntil(i), fe.SECONDS_PER_DAY)
                    }
                    throw new r("Unsupported unit: " + n)
                }
                return n.between(this, i)
            }, i._microsUntil = function(t) {
                var e = m.safeSubtract(t.epochSecond(), this.epochSecond()),
                    n = m.safeMultiply(e, 1e6);
                return m.safeAdd(n, m.intDiv(t.nano() - this.nano(), 1e3))
            }, i._nanosUntil = function(t) {
                var e = m.safeSubtract(t.epochSecond(), this.epochSecond()),
                    n = m.safeMultiply(e, fe.NANOS_PER_SECOND);
                return m.safeAdd(n, t.nano() - this.nano())
            }, i._secondsUntil = function(t) {
                var e = m.safeSubtract(t.epochSecond(), this.epochSecond()),
                    n = t.nano() - this.nano();
                return e > 0 && n < 0 ? e-- : e < 0 && n > 0 && e++, e
            }, i.atOffset = function(t) {
                return re.ofInstant(this, t)
            }, i.atZone = function(t) {
                return ie.ofInstant(this, t)
            }, i.toEpochMilli = function() {
                return m.safeMultiply(this._seconds, 1e3) + m.intDiv(this._nanos, ce)
            }, i.compareTo = function(t) {
                _(t, "otherInstant"), d(t, e, "otherInstant");
                var n = m.compareNumbers(this._seconds, t._seconds);
                return 0 !== n ? n : this._nanos - t._nanos
            }, i.isAfter = function(t) {
                return this.compareTo(t) > 0
            }, i.isBefore = function(t) {
                return this.compareTo(t) < 0
            }, i.equals = function(t) {
                return this === t || t instanceof e && (this.epochSecond() === t.epochSecond() && this.nano() === t.nano())
            }, i.hashCode = function() {
                return m.hashCode(this._seconds, this._nanos)
            }, i.toString = function() {
                return kt.ISO_INSTANT.format(this)
            }, i.toJSON = function() {
                return this.toString()
            }, e
        }(k);
    var _e = function() {
            function t() {}
            t.systemUTC = function() {
                return new de(X.UTC)
            }, t.systemDefaultZone = function() {
                return new de(Z.systemDefault())
            }, t.system = function(t) {
                return new de(t)
            }, t.fixed = function(t, e) {
                return new pe(t, e)
            }, t.offset = function(t, e) {
                return new Oe(t, e)
            };
            var e = t.prototype;
            return e.millis = function() {
                p("Clock.millis")
            }, e.instant = function() {
                p("Clock.instant")
            }, e.zone = function() {
                p("Clock.zone")
            }, e.withZone = function() {
                p("Clock.withZone")
            }, t
        }(),
        de = function(t) {
            function e(e) {
                var n;
                return _(e, "zone"), (n = t.call(this) || this)._zone = e, n
            }
            h(e, t);
            var n = e.prototype;
            return n.zone = function() {
                return this._zone
            }, n.millis = function() {
                return (new Date).getTime()
            }, n.instant = function() {
                return le.ofEpochMilli(this.millis())
            }, n.equals = function(t) {
                return t instanceof e && this._zone.equals(t._zone)
            }, n.withZone = function(t) {
                return t.equals(this._zone) ? this : new e(t)
            }, n.toString = function() {
                return "SystemClock[" + this._zone.toString() + "]"
            }, e
        }(_e),
        pe = function(t) {
            function e(e, n) {
                var i;
                return (i = t.call(this) || this)._instant = e, i._zoneId = n, i
            }
            h(e, t);
            var n = e.prototype;
            return n.instant = function() {
                return this._instant
            }, n.millis = function() {
                return this._instant.toEpochMilli()
            }, n.zone = function() {
                return this._zoneId
            }, n.toString = function() {
                return "FixedClock[]"
            }, n.equals = function(t) {
                return t instanceof e && (this._instant.equals(t._instant) && this._zoneId.equals(t._zoneId))
            }, n.withZone = function(t) {
                return t.equals(this._zoneId) ? this : new e(this._instant, t)
            }, e
        }(_e),
        Oe = function(t) {
            function e(e, n) {
                var i;
                return (i = t.call(this) || this)._baseClock = e, i._offset = n, i
            }
            h(e, t);
            var n = e.prototype;
            return n.zone = function() {
                return this._baseClock.zone()
            }, n.withZone = function(t) {
                return t.equals(this._baseClock.zone()) ? this : new e(this._baseClock.withZone(t), this._offset)
            }, n.millis = function() {
                return this._baseClock.millis() + this._offset.toMillis()
            }, n.instant = function() {
                return this._baseClock.instant().plus(this._offset)
            }, n.equals = function(t) {
                return t instanceof e && (this._baseClock.equals(t._baseClock) && this._offset.equals(t._offset))
            }, n.toString = function() {
                return "OffsetClock[" + this._baseClock + "," + this._offset + "]"
            }, e
        }(_e),
        Ee = function() {
            function t(t, e, n) {
                if (_(t, "transition"), _(e, "offsetBefore"), _(n, "offsetAfter"), e.equals(n)) throw new o("Offsets must not be equal");
                if (0 !== t.nano()) throw new o("Nano-of-second must be zero");
                this._transition = t instanceof he ? t : he.ofEpochSecond(t, 0, e), this._offsetBefore = e, this._offsetAfter = n
            }
            t.of = function(e, n, i) {
                return new t(e, n, i)
            };
            var e = t.prototype;
            return e.instant = function() {
                return this._transition.toInstant(this._offsetBefore)
            }, e.toEpochSecond = function() {
                return this._transition.toEpochSecond(this._offsetBefore)
            }, e.dateTimeBefore = function() {
                return this._transition
            }, e.dateTimeAfter = function() {
                return this._transition.plusSeconds(this.durationSeconds())
            }, e.offsetBefore = function() {
                return this._offsetBefore
            }, e.offsetAfter = function() {
                return this._offsetAfter
            }, e.duration = function() {
                return T.ofSeconds(this.durationSeconds())
            }, e.durationSeconds = function() {
                return this._offsetAfter.totalSeconds() - this._offsetBefore.totalSeconds()
            }, e.isGap = function() {
                return this._offsetAfter.totalSeconds() > this._offsetBefore.totalSeconds()
            }, e.isOverlap = function() {
                return this._offsetAfter.totalSeconds() < this._offsetBefore.totalSeconds()
            }, e.isValidOffset = function(t) {
                return !this.isGap() && (this._offsetBefore.equals(t) || this._offsetAfter.equals(t))
            }, e.validOffsets = function() {
                return this.isGap() ? [] : [this._offsetBefore, this._offsetAfter]
            }, e.compareTo = function(t) {
                return this.instant().compareTo(t.instant())
            }, e.equals = function(e) {
                if (e === this) return !0;
                if (e instanceof t) {
                    var n = e;
                    return this._transition.equals(n._transition) && this._offsetBefore.equals(n.offsetBefore()) && this._offsetAfter.equals(n.offsetAfter())
                }
                return !1
            }, e.hashCode = function() {
                return this._transition.hashCode() ^ this._offsetBefore.hashCode() ^ this._offsetAfter.hashCode() >>> 16
            }, e.toString = function() {
                return "Transition[" + (this.isGap() ? "Gap" : "Overlap") + " at " + this._transition.toString() + this._offsetBefore.toString() + " to " + this._offsetAfter + "]"
            }, t
        }();
    var Se = function(t) {
            function e() {
                return t.apply(this, arguments) || this
            }
            h(e, t);
            var i = e.prototype;
            return i.isFixedOffset = function() {
                return !1
            }, i.offsetOfInstant = function(t) {
                var e = new Date(t.toEpochMilli()).getTimezoneOffset();
                return X.ofTotalMinutes(-1 * e)
            }, i.offsetOfEpochMilli = function(t) {
                var e = new Date(t).getTimezoneOffset();
                return X.ofTotalMinutes(-1 * e)
            }, i.offsetOfLocalDateTime = function(t) {
                var e = 1e3 * t.toEpochSecond(X.UTC),
                    n = new Date(e).getTimezoneOffset(),
                    i = new Date(e + 6e4 * n).getTimezoneOffset();
                return X.ofTotalMinutes(-1 * i)
            }, i.validOffsets = function(t) {
                return [this.offsetOfLocalDateTime(t)]
            }, i.transition = function() {
                return null
            }, i.standardOffset = function(t) {
                return this.offsetOfInstant(t)
            }, i.daylightSavings = function() {
                this._throwNotSupported()
            }, i.isDaylightSavings = function() {
                this._throwNotSupported()
            }, i.isValidOffset = function(t, e) {
                return this.offsetOfLocalDateTime(t).equals(e)
            }, i.nextTransition = function() {
                this._throwNotSupported()
            }, i.previousTransition = function() {
                this._throwNotSupported()
            }, i.transitions = function() {
                this._throwNotSupported()
            }, i.transitionRules = function() {
                this._throwNotSupported()
            }, i._throwNotSupported = function() {
                throw new n("not supported operation")
            }, i.equals = function(t) {
                return this === t || t instanceof e
            }, i.toString = function() {
                return "SYSTEM"
            }, e
        }(z),
        me = function(t) {
            function e() {
                var e;
                return (e = t.call(this) || this)._rules = new Se, e
            }
            h(e, t);
            var n = e.prototype;
            return n.rules = function() {
                return this._rules
            }, n.equals = function(t) {
                return this === t
            }, n.id = function() {
                return "SYSTEM"
            }, e
        }(Z),
        Ne = function() {
            function t() {}
            return t.systemDefault = function() {
                return De
            }, t.getAvailableZoneIds = function() {
                return gt.getAvailableZoneIds()
            }, t.of = function(t) {
                if (_(t, "zoneId"), "Z" === t) return X.UTC;
                if (1 === t.length) throw new n("Invalid zone: " + t);
                if (q.startsWith(t, "+") || q.startsWith(t, "-")) return X.of(t);
                if ("UTC" === t || "GMT" === t || "GMT0" === t || "UT" === t) return new It(t, X.UTC.rules());
                if (q.startsWith(t, "UTC+") || q.startsWith(t, "GMT+") || q.startsWith(t, "UTC-") || q.startsWith(t, "GMT-")) {
                    var e = X.of(t.substring(3));
                    return 0 === e.totalSeconds() ? new It(t.substring(0, 3), e.rules()) : new It(t.substring(0, 3) + e.id(), e.rules())
                }
                if (q.startsWith(t, "UT+") || q.startsWith(t, "UT-")) {
                    var i = X.of(t.substring(2));
                    return 0 === i.totalSeconds() ? new It("UT", i.rules()) : new It("UT" + i.id(), i.rules())
                }
                return "SYSTEM" === t ? Z.systemDefault() : It.ofId(t)
            }, t.ofOffset = function(t, e) {
                if (_(t, "prefix"), _(e, "offset"), 0 === t.length) return e;
                if ("GMT" === t || "UTC" === t || "UT" === t) return 0 === e.totalSeconds() ? new It(t, e.rules()) : new It(t + e.id(), e.rules());
                throw new o("Invalid prefix, must be GMT, UTC or UT: " + t)
            }, t.from = function(t) {
                _(t, "temporal");
                var e = t.query(g.zone());
                if (null == e) throw new n("Unable to obtain ZoneId from TemporalAccessor: " + t + ", type " + (null != t.constructor ? t.constructor.name : ""));
                return e
            }, t
        }(),
        De = null;
    var Ae = !1;
    Ae || (Ae = !0, v.MIN_VALUE = -999999, v.MAX_VALUE = 999999, T.ZERO = new T(0, 0), w.NANOS = new w("Nanos", T.ofNanos(1)), w.MICROS = new w("Micros", T.ofNanos(1e3)), w.MILLIS = new w("Millis", T.ofNanos(1e6)), w.SECONDS = new w("Seconds", T.ofSeconds(1)), w.MINUTES = new w("Minutes", T.ofSeconds(60)), w.HOURS = new w("Hours", T.ofSeconds(3600)), w.HALF_DAYS = new w("HalfDays", T.ofSeconds(43200)), w.DAYS = new w("Days", T.ofSeconds(86400)), w.WEEKS = new w("Weeks", T.ofSeconds(604800)), w.MONTHS = new w("Months", T.ofSeconds(2629746)), w.YEARS = new w("Years", T.ofSeconds(31556952)), w.DECADES = new w("Decades", T.ofSeconds(315569520)), w.CENTURIES = new w("Centuries", T.ofSeconds(3155695200)), w.MILLENNIA = new w("Millennia", T.ofSeconds(31556952e3)), w.ERAS = new w("Eras", T.ofSeconds(31556952 * (v.MAX_VALUE + 1))), w.FOREVER = new w("Forever", T.ofSeconds(m.MAX_SAFE_INTEGER, 999999999)), R.NANO_OF_SECOND = new R("NanoOfSecond", w.NANOS, w.SECONDS, M.of(0, 999999999)), R.NANO_OF_DAY = new R("NanoOfDay", w.NANOS, w.DAYS, M.of(0, 86399999999999)), R.MICRO_OF_SECOND = new R("MicroOfSecond", w.MICROS, w.SECONDS, M.of(0, 999999)), R.MICRO_OF_DAY = new R("MicroOfDay", w.MICROS, w.DAYS, M.of(0, 86399999999)), R.MILLI_OF_SECOND = new R("MilliOfSecond", w.MILLIS, w.SECONDS, M.of(0, 999)), R.MILLI_OF_DAY = new R("MilliOfDay", w.MILLIS, w.DAYS, M.of(0, 86399999)), R.SECOND_OF_MINUTE = new R("SecondOfMinute", w.SECONDS, w.MINUTES, M.of(0, 59)), R.SECOND_OF_DAY = new R("SecondOfDay", w.SECONDS, w.DAYS, M.of(0, 86399)), R.MINUTE_OF_HOUR = new R("MinuteOfHour", w.MINUTES, w.HOURS, M.of(0, 59)), R.MINUTE_OF_DAY = new R("MinuteOfDay", w.MINUTES, w.DAYS, M.of(0, 1439)), R.HOUR_OF_AMPM = new R("HourOfAmPm", w.HOURS, w.HALF_DAYS, M.of(0, 11)), R.CLOCK_HOUR_OF_AMPM = new R("ClockHourOfAmPm", w.HOURS, w.HALF_DAYS, M.of(1, 12)), R.HOUR_OF_DAY = new R("HourOfDay", w.HOURS, w.DAYS, M.of(0, 23)), R.CLOCK_HOUR_OF_DAY = new R("ClockHourOfDay", w.HOURS, w.DAYS, M.of(1, 24)), R.AMPM_OF_DAY = new R("AmPmOfDay", w.HALF_DAYS, w.DAYS, M.of(0, 1)), R.DAY_OF_WEEK = new R("DayOfWeek", w.DAYS, w.WEEKS, M.of(1, 7)), R.ALIGNED_DAY_OF_WEEK_IN_MONTH = new R("AlignedDayOfWeekInMonth", w.DAYS, w.WEEKS, M.of(1, 7)), R.ALIGNED_DAY_OF_WEEK_IN_YEAR = new R("AlignedDayOfWeekInYear", w.DAYS, w.WEEKS, M.of(1, 7)), R.DAY_OF_MONTH = new R("DayOfMonth", w.DAYS, w.MONTHS, M.of(1, 28, 31), "day"), R.DAY_OF_YEAR = new R("DayOfYear", w.DAYS, w.YEARS, M.of(1, 365, 366)), R.EPOCH_DAY = new R("EpochDay", w.DAYS, w.FOREVER, M.of(-365961662, 364522971)), R.ALIGNED_WEEK_OF_MONTH = new R("AlignedWeekOfMonth", w.WEEKS, w.MONTHS, M.of(1, 4, 5)), R.ALIGNED_WEEK_OF_YEAR = new R("AlignedWeekOfYear", w.WEEKS, w.YEARS, M.of(1, 53)), R.MONTH_OF_YEAR = new R("MonthOfYear", w.MONTHS, w.YEARS, M.of(1, 12), "month"), R.PROLEPTIC_MONTH = new R("ProlepticMonth", w.MONTHS, w.FOREVER, M.of(12 * v.MIN_VALUE, 12 * v.MAX_VALUE + 11)), R.YEAR_OF_ERA = new R("YearOfEra", w.YEARS, w.FOREVER, M.of(1, v.MAX_VALUE, v.MAX_VALUE + 1)), R.YEAR = new R("Year", w.YEARS, w.FOREVER, M.of(v.MIN_VALUE, v.MAX_VALUE), "year"), R.ERA = new R("Era", w.ERAS, w.FOREVER, M.of(0, 1)), R.INSTANT_SECONDS = new R("InstantSeconds", w.SECONDS, w.FOREVER, M.of(S, E)), R.OFFSET_SECONDS = new R("OffsetSeconds", w.SECONDS, w.FOREVER, M.of(-64800, 64800)), function() {
        fe.HOURS = [];
        for (var t = 0; t < 24; t++) fe.of(t, 0, 0, 0);
        fe.MIN = fe.HOURS[0], fe.MAX = new fe(23, 59, 59, 999999999), fe.MIDNIGHT = fe.HOURS[0], fe.NOON = fe.HOURS[12], fe.FROM = Y("LocalTime.FROM", (function(t) {
            return fe.from(t)
        }))
    }(), ht = new rt, ft = new st, ct = new ot, lt = new at, _t = new ut("WeekBasedYears", T.ofSeconds(31556952)), dt = new ut("QuarterYears", T.ofSeconds(7889238)), et.DAY_OF_QUARTER = ht, et.QUARTER_OF_YEAR = ft, et.WEEK_OF_WEEK_BASED_YEAR = ct, et.WEEK_BASED_YEAR = lt, et.WEEK_BASED_YEARS = _t, et.QUARTER_YEARS = dt, ae.prototype.isoWeekOfWeekyear = function() {
        return this.get(et.WEEK_OF_WEEK_BASED_YEAR)
    }, ae.prototype.isoWeekyear = function() {
        return this.get(et.WEEK_BASED_YEAR)
    }, g.ZONE_ID = Y("ZONE_ID", (function(t) {
        return t.query(g.ZONE_ID)
    })), g.CHRONO = Y("CHRONO", (function(t) {
        return t.query(g.CHRONO)
    })), g.PRECISION = Y("PRECISION", (function(t) {
        return t.query(g.PRECISION)
    })), g.OFFSET = Y("OFFSET", (function(t) {
        return t.isSupported(R.OFFSET_SECONDS) ? X.ofTotalSeconds(t.get(R.OFFSET_SECONDS)) : null
    })), g.ZONE = Y("ZONE", (function(t) {
        var e = t.query(g.ZONE_ID);
        return null != e ? e : t.query(g.OFFSET)
    })), g.LOCAL_DATE = Y("LOCAL_DATE", (function(t) {
        return t.isSupported(R.EPOCH_DAY) ? ae.ofEpochDay(t.getLong(R.EPOCH_DAY)) : null
    })), g.LOCAL_TIME = Y("LOCAL_TIME", (function(t) {
        return t.isSupported(R.NANO_OF_DAY) ? fe.ofNanoOfDay(t.getLong(R.NANO_OF_DAY)) : null
    })), L.MONDAY = new L(0, "MONDAY"), L.TUESDAY = new L(1, "TUESDAY"), L.WEDNESDAY = new L(2, "WEDNESDAY"), L.THURSDAY = new L(3, "THURSDAY"), L.FRIDAY = new L(4, "FRIDAY"), L.SATURDAY = new L(5, "SATURDAY"), L.SUNDAY = new L(6, "SUNDAY"), L.FROM = Y("DayOfWeek.FROM", (function(t) {
        return L.from(t)
    })), C = [L.MONDAY, L.TUESDAY, L.WEDNESDAY, L.THURSDAY, L.FRIDAY, L.SATURDAY, L.SUNDAY], le.MIN_SECONDS = -31619119219200, le.MAX_SECONDS = 31494816403199, le.EPOCH = new le(0, 0), le.MIN = le.ofEpochSecond(le.MIN_SECONDS, 0), le.MAX = le.ofEpochSecond(le.MAX_SECONDS, 999999999), le.FROM = Y("Instant.FROM", (function(t) {
        return le.from(t)
    })), ae.MIN = ae.of(v.MIN_VALUE, 1, 1), ae.MAX = ae.of(v.MAX_VALUE, 12, 31), ae.EPOCH_0 = ae.ofEpochDay(0), ae.FROM = Y("LocalDate.FROM", (function(t) {
        return ae.from(t)
    })), he.MIN = he.of(ae.MIN, fe.MIN), he.MAX = he.of(ae.MAX, fe.MAX), he.FROM = Y("LocalDateTime.FROM", (function(t) {
        return he.from(t)
    })), jt.MIN_VALUE = v.MIN_VALUE, jt.MAX_VALUE = v.MAX_VALUE, Kt = (new Ut).appendValue(R.YEAR, 4, 10, Ot.EXCEEDS_PAD).toFormatter(), jt.FROM = Y("Year.FROM", (function(t) {
        return jt.from(t)
    })), U.JANUARY = new U(1, "JANUARY"), U.FEBRUARY = new U(2, "FEBRUARY"), U.MARCH = new U(3, "MARCH"), U.APRIL = new U(4, "APRIL"), U.MAY = new U(5, "MAY"), U.JUNE = new U(6, "JUNE"), U.JULY = new U(7, "JULY"), U.AUGUST = new U(8, "AUGUST"), U.SEPTEMBER = new U(9, "SEPTEMBER"), U.OCTOBER = new U(10, "OCTOBER"), U.NOVEMBER = new U(11, "NOVEMBER"), U.DECEMBER = new U(12, "DECEMBER"), P = [U.JANUARY, U.FEBRUARY, U.MARCH, U.APRIL, U.MAY, U.JUNE, U.JULY, U.AUGUST, U.SEPTEMBER, U.OCTOBER, U.NOVEMBER, U.DECEMBER], Zt = (new Ut).appendValue(R.YEAR, 4, 10, Ot.EXCEEDS_PAD).appendLiteral("-").appendValue(R.MONTH_OF_YEAR, 2).toFormatter(), zt.FROM = Y("YearMonth.FROM", (function(t) {
        return zt.from(t)
    })), Bt = (new Ut).appendLiteral("--").appendValue(R.MONTH_OF_YEAR, 2).appendLiteral("-").appendValue(R.DAY_OF_MONTH, 2).toFormatter(), qt.FROM = Y("MonthDay.FROM", (function(t) {
        return qt.from(t)
    })), b.ofDays(0), X.MAX_SECONDS = 18 * fe.SECONDS_PER_HOUR, X.UTC = X.ofTotalSeconds(0), X.MIN = X.ofTotalSeconds(-X.MAX_SECONDS), X.MAX = X.ofTotalSeconds(X.MAX_SECONDS), ie.FROM = Y("ZonedDateTime.FROM", (function(t) {
        return ie.from(t)
    })), De = new me, Z.systemDefault = Ne.systemDefault, Z.getAvailableZoneIds = Ne.getAvailableZoneIds, Z.of = Ne.of, Z.ofOffset = Ne.ofOffset, Z.from = Ne.from, X.from = Ne.from, Z.SYSTEM = De, Z.UTC = X.ofTotalSeconds(0), te.INSTANCE = new te("IsoChronology"), kt.ISO_LOCAL_DATE = (new Ut).appendValue(R.YEAR, 4, 10, Ot.EXCEEDS_PAD).appendLiteral("-").appendValue(R.MONTH_OF_YEAR, 2).appendLiteral("-").appendValue(R.DAY_OF_MONTH, 2).toFormatter(x.STRICT).withChronology(te.INSTANCE), kt.ISO_LOCAL_TIME = (new Ut).appendValue(R.HOUR_OF_DAY, 2).appendLiteral(":").appendValue(R.MINUTE_OF_HOUR, 2).optionalStart().appendLiteral(":").appendValue(R.SECOND_OF_MINUTE, 2).optionalStart().appendFraction(R.NANO_OF_SECOND, 0, 9, !0).toFormatter(x.STRICT), kt.ISO_LOCAL_DATE_TIME = (new Ut).parseCaseInsensitive().append(kt.ISO_LOCAL_DATE).appendLiteral("T").append(kt.ISO_LOCAL_TIME).toFormatter(x.STRICT).withChronology(te.INSTANCE), kt.ISO_INSTANT = (new Ut).parseCaseInsensitive().appendInstant().toFormatter(x.STRICT), kt.ISO_OFFSET_DATE_TIME = (new Ut).parseCaseInsensitive().append(kt.ISO_LOCAL_DATE_TIME).appendOffsetId().toFormatter(x.STRICT).withChronology(te.INSTANCE), kt.ISO_ZONED_DATE_TIME = (new Ut).append(kt.ISO_OFFSET_DATE_TIME).optionalStart().appendLiteral("[").parseCaseSensitive().appendZoneId().appendLiteral("]").toFormatter(x.STRICT).withChronology(te.INSTANCE), kt.BASIC_ISO_DATE = (new Ut).appendValue(R.YEAR, 4, 10, Ot.EXCEEDS_PAD).appendValue(R.MONTH_OF_YEAR, 2).appendValue(R.DAY_OF_MONTH, 2).toFormatter(x.STRICT).withChronology(te.INSTANCE), kt.ISO_OFFSET_DATE = (new Ut).parseCaseInsensitive().append(kt.ISO_LOCAL_DATE).appendOffsetId().toFormatter(x.STRICT).withChronology(te.INSTANCE), kt.ISO_OFFSET_TIME = (new Ut).parseCaseInsensitive().append(kt.ISO_LOCAL_TIME).appendOffsetId().toFormatter(x.STRICT).withChronology(te.INSTANCE), kt.ISO_ORDINAL_DATE = (new Ut).appendValue(R.YEAR, 4, 10, Ot.EXCEEDS_PAD).appendLiteral("-").appendValue(R.DAY_OF_YEAR).toFormatter(x.STRICT), kt.ISO_WEEK_DATE = (new Ut).appendValue(R.YEAR, 4, 10, Ot.EXCEEDS_PAD).appendLiteral("-W").appendValue(R.ALIGNED_WEEK_OF_YEAR).appendLiteral("-").appendValue(R.DAY_OF_WEEK).toFormatter(x.STRICT), kt.ISO_DATE = (new Ut).parseCaseInsensitive().append(kt.ISO_LOCAL_DATE).optionalStart().appendOffsetId().optionalEnd().toFormatter(x.STRICT).withChronology(te.INSTANCE), kt.ISO_TIME = (new Ut).parseCaseInsensitive().append(kt.ISO_LOCAL_TIME).optionalStart().appendOffsetId().optionalEnd().toFormatter(x.STRICT), kt.ISO_DATE_TIME = (new Ut).append(kt.ISO_LOCAL_DATE_TIME).optionalStart().appendOffsetId().optionalEnd().toFormatter(x.STRICT).withChronology(te.INSTANCE), kt.PARSED_EXCESS_DAYS = Y("PARSED_EXCESS_DAYS", (function(t) {
        return t instanceof J ? t.excessDays : b.ZERO
    })), kt.PARSED_LEAP_SECOND = Y("PARSED_LEAP_SECOND", (function(t) {
        return t instanceof J && t.leapSecond
    })), Tt.BASE_DATE = ae.of(2e3, 1, 1), Ut.CompositePrinterParser = mt, Ut.PadPrinterParserDecorator = yt, Ut.SettingsParser = Mt, Ut.CharLiteralPrinterParser = Rt, Ut.StringLiteralPrinterParser = Rt, Ut.CharLiteralPrinterParser = St, Ut.NumberPrinterParser = At, Ut.ReducedPrinterParser = Tt, Ut.FractionPrinterParser = Nt, Ut.OffsetIdPrinterParser = wt, Ut.ZoneIdPrinterParser = Ft, re.MIN = he.MIN.atOffset(X.MAX), re.MAX = he.MAX.atOffset(X.MIN), re.FROM = Y("OffsetDateTime.FROM", (function(t) {
        return re.from(t)
    })), ee.MIN = ee.ofNumbers(0, 0, 0, 0, X.MAX), ee.MAX = ee.ofNumbers(23, 59, 59, 999999999, X.MIN), ee.FROM = Y("OffsetTime.FROM", (function(t) {
        return ee.from(t)
    })));
    var Te = function() {
        function t(t, e) {
            var n;
            if (t instanceof le) this.instant = t;
            else {
                if (t instanceof ae) e = null == e ? Z.systemDefault() : e, n = t.atStartOfDay(e);
                else if (t instanceof he) e = null == e ? Z.systemDefault() : e, n = t.atZone(e);
                else {
                    if (!(t instanceof ie)) throw new o("unsupported instance for convert operation:" + t);
                    n = null == e ? t : t.withZoneSameInstant(e)
                }
                this.instant = n.toInstant()
            }
        }
        var e = t.prototype;
        return e.toDate = function() {
            return new Date(this.instant.toEpochMilli())
        }, e.toEpochMilli = function() {
            return this.instant.toEpochMilli()
        }, t
    }();

    function ve(t, e) {
        return new Te(t, e)
    }

    function we(t, e) {
        if (void 0 === e && (e = Z.systemDefault()), _(t, "date"), _(e, "zone"), t instanceof Date) return le.ofEpochMilli(t.getTime()).atZone(e);
        if ("function" == typeof t.toDate && t.toDate() instanceof Date) return le.ofEpochMilli(t.toDate().getTime()).atZone(e);
        throw new o("date must be a javascript Date or a moment instance")
    }
    var ye, Me, Re = {
            assert: O,
            DateTimeBuilder: J,
            DateTimeParseContext: Q,
            DateTimePrintContext: tt,
            MathUtil: m,
            StringUtil: q,
            StringBuilder: xt
        },
        ge = {
            _: Re,
            convert: ve,
            nativeJs: we,
            ArithmeticException: s,
            DateTimeException: n,
            DateTimeParseException: i,
            IllegalArgumentException: o,
            IllegalStateException: a,
            UnsupportedTemporalTypeException: r,
            NullPointerException: u,
            Clock: _e,
            DayOfWeek: L,
            Duration: T,
            Instant: le,
            LocalDate: ae,
            LocalTime: fe,
            LocalDateTime: he,
            OffsetTime: ee,
            OffsetDateTime: re,
            Month: U,
            MonthDay: qt,
            ParsePosition: H,
            Period: b,
            Year: jt,
            YearConstants: v,
            YearMonth: zt,
            ZonedDateTime: ie,
            ZoneOffset: X,
            ZoneId: Z,
            ZoneRegion: It,
            ZoneOffsetTransition: Ee,
            ZoneRules: z,
            ZoneRulesProvider: gt,
            ChronoLocalDate: B,
            ChronoLocalDateTime: ue,
            ChronoZonedDateTime: ne,
            IsoChronology: te,
            ChronoField: R,
            ChronoUnit: w,
            IsoFields: et,
            Temporal: k,
            TemporalAccessor: I,
            TemporalAdjuster: Gt,
            TemporalAdjusters: Xt,
            TemporalAmount: D,
            TemporalField: y,
            TemporalQueries: g,
            TemporalQuery: F,
            TemporalUnit: A,
            ValueRange: M,
            DateTimeFormatter: kt,
            DateTimeFormatterBuilder: Ut,
            DecimalStyle: pt,
            ResolverStyle: x,
            SignStyle: Ot,
            TextStyle: Et
        },
        Ie = (ye = ge, Me = [], function(t) {
            return ~Me.indexOf(t) || (t(ye), Me.push(t)), ye
        });
    return ge.use = Ie, t.ArithmeticException = s, t.ChronoField = R, t.ChronoLocalDate = B, t.ChronoLocalDateTime = ue, t.ChronoUnit = w, t.ChronoZonedDateTime = ne, t.Clock = _e, t.DateTimeException = n, t.DateTimeFormatter = kt, t.DateTimeFormatterBuilder = Ut, t.DateTimeParseException = i, t.DayOfWeek = L, t.DecimalStyle = pt, t.Duration = T, t.IllegalArgumentException = o, t.IllegalStateException = a, t.Instant = le, t.IsoChronology = te, t.IsoFields = et, t.LocalDate = ae, t.LocalDateTime = he, t.LocalTime = fe, t.Month = U, t.MonthDay = qt, t.NullPointerException = u, t.OffsetDateTime = re, t.OffsetTime = ee, t.ParsePosition = H, t.Period = b, t.ResolverStyle = x, t.SignStyle = Ot, t.Temporal = k, t.TemporalAccessor = I, t.TemporalAdjuster = Gt, t.TemporalAdjusters = Xt, t.TemporalAmount = D, t.TemporalField = y, t.TemporalQueries = g, t.TemporalQuery = F, t.TemporalUnit = A, t.TextStyle = Et, t.UnsupportedTemporalTypeException = r, t.ValueRange = M, t.Year = jt, t.YearConstants = v, t.YearMonth = zt, t.ZoneId = Z, t.ZoneOffset = X, t.ZoneOffsetTransition = Ee, t.ZoneRegion = It, t.ZoneRules = z, t.ZoneRulesProvider = gt, t.ZonedDateTime = ie, t._ = Re, t.convert = ve, t.nativeJs = we, t.use = Ie, t
}({});

	/* end jsjoda */

	scriptVars.jodaTime = JSJoda;

    /* start PapaParse (CSV parser library) 
    from https://codeload.github.com/mholt/PapaParse/zip/refs/tags/5.0.2 > papaparse.min.js 
    */

/* @license
Papa Parse
v5.0.2
https://github.com/mholt/PapaParse
License: MIT
*/
!function(e,t){"function"==typeof define&&define.amd?define([],t):"object"==typeof module&&"undefined"!=typeof exports?module.exports=t():e.Papa=t()}(this,function s(){"use strict";var f="undefined"!=typeof self?self:"undefined"!=typeof window?window:void 0!==f?f:{};var n=!f.document&&!!f.postMessage,o=n&&/blob:/i.test((f.location||{}).protocol),a={},h=0,b={parse:function(e,t){var r=(t=t||{}).dynamicTyping||!1;q(r)&&(t.dynamicTypingFunction=r,r={});if(t.dynamicTyping=r,t.transform=!!q(t.transform)&&t.transform,t.worker&&b.WORKERS_SUPPORTED){var i=function(){if(!b.WORKERS_SUPPORTED)return!1;var e=(r=f.URL||f.webkitURL||null,i=s.toString(),b.BLOB_URL||(b.BLOB_URL=r.createObjectURL(new Blob(["(",i,")();"],{type:"text/javascript"})))),t=new f.Worker(e);var r,i;return t.onmessage=_,t.id=h++,a[t.id]=t}();return i.userStep=t.step,i.userChunk=t.chunk,i.userComplete=t.complete,i.userError=t.error,t.step=q(t.step),t.chunk=q(t.chunk),t.complete=q(t.complete),t.error=q(t.error),delete t.worker,void i.postMessage({input:e,config:t,workerId:i.id})}var n=null;b.NODE_STREAM_INPUT,"string"==typeof e?n=t.download?new l(t):new p(t):!0===e.readable&&q(e.read)&&q(e.on)?n=new m(t):(f.File&&e instanceof File||e instanceof Object)&&(n=new c(t));return n.stream(e)},unparse:function(e,t){var i=!1,_=!0,g=",",v="\r\n",n='"',s=n+n,r=!1,a=null;!function(){if("object"!=typeof t)return;"string"!=typeof t.delimiter||b.BAD_DELIMITERS.filter(function(e){return-1!==t.delimiter.indexOf(e)}).length||(g=t.delimiter);("boolean"==typeof t.quotes||Array.isArray(t.quotes))&&(i=t.quotes);"boolean"!=typeof t.skipEmptyLines&&"string"!=typeof t.skipEmptyLines||(r=t.skipEmptyLines);"string"==typeof t.newline&&(v=t.newline);"string"==typeof t.quoteChar&&(n=t.quoteChar);"boolean"==typeof t.header&&(_=t.header);if(Array.isArray(t.columns)){if(0===t.columns.length)throw new Error("Option columns is empty");a=t.columns}void 0!==t.escapeChar&&(s=t.escapeChar+n)}();var o=new RegExp(U(n),"g");"string"==typeof e&&(e=JSON.parse(e));if(Array.isArray(e)){if(!e.length||Array.isArray(e[0]))return u(null,e,r);if("object"==typeof e[0])return u(a||h(e[0]),e,r)}else if("object"==typeof e)return"string"==typeof e.data&&(e.data=JSON.parse(e.data)),Array.isArray(e.data)&&(e.fields||(e.fields=e.meta&&e.meta.fields),e.fields||(e.fields=Array.isArray(e.data[0])?e.fields:h(e.data[0])),Array.isArray(e.data[0])||"object"==typeof e.data[0]||(e.data=[e.data])),u(e.fields||[],e.data||[],r);throw new Error("Unable to serialize unrecognized input");function h(e){if("object"!=typeof e)return[];var t=[];for(var r in e)t.push(r);return t}function u(e,t,r){var i="";"string"==typeof e&&(e=JSON.parse(e)),"string"==typeof t&&(t=JSON.parse(t));var n=Array.isArray(e)&&0<e.length,s=!Array.isArray(t[0]);if(n&&_){for(var a=0;a<e.length;a++)0<a&&(i+=g),i+=y(e[a],a);0<t.length&&(i+=v)}for(var o=0;o<t.length;o++){var h=n?e.length:t[o].length,u=!1,f=n?0===Object.keys(t[o]).length:0===t[o].length;if(r&&!n&&(u="greedy"===r?""===t[o].join("").trim():1===t[o].length&&0===t[o][0].length),"greedy"===r&&n){for(var d=[],l=0;l<h;l++){var c=s?e[l]:l;d.push(t[o][c])}u=""===d.join("").trim()}if(!u){for(var p=0;p<h;p++){0<p&&!f&&(i+=g);var m=n&&s?e[p]:p;i+=y(t[o][m],p)}o<t.length-1&&(!r||0<h&&!f)&&(i+=v)}}return i}function y(e,t){if(null==e)return"";if(e.constructor===Date)return JSON.stringify(e).slice(1,25);e=e.toString().replace(o,s);var r="boolean"==typeof i&&i||Array.isArray(i)&&i[t]||function(e,t){for(var r=0;r<t.length;r++)if(-1<e.indexOf(t[r]))return!0;return!1}(e,b.BAD_DELIMITERS)||-1<e.indexOf(g)||" "===e.charAt(0)||" "===e.charAt(e.length-1);return r?n+e+n:e}}};if(b.RECORD_SEP=String.fromCharCode(30),b.UNIT_SEP=String.fromCharCode(31),b.BYTE_ORDER_MARK="\ufeff",b.BAD_DELIMITERS=["\r","\n",'"',b.BYTE_ORDER_MARK],b.WORKERS_SUPPORTED=!n&&!!f.Worker,b.NODE_STREAM_INPUT=1,b.LocalChunkSize=10485760,b.RemoteChunkSize=5242880,b.DefaultDelimiter=",",b.Parser=E,b.ParserHandle=r,b.NetworkStreamer=l,b.FileStreamer=c,b.StringStreamer=p,b.ReadableStreamStreamer=m,f.jQuery){var d=f.jQuery;d.fn.parse=function(o){var r=o.config||{},h=[];return this.each(function(e){if(!("INPUT"===d(this).prop("tagName").toUpperCase()&&"file"===d(this).attr("type").toLowerCase()&&f.FileReader)||!this.files||0===this.files.length)return!0;for(var t=0;t<this.files.length;t++)h.push({file:this.files[t],inputElem:this,instanceConfig:d.extend({},r)})}),e(),this;function e(){if(0!==h.length){var e,t,r,i,n=h[0];if(q(o.before)){var s=o.before(n.file,n.inputElem);if("object"==typeof s){if("abort"===s.action)return e="AbortError",t=n.file,r=n.inputElem,i=s.reason,void(q(o.error)&&o.error({name:e},t,r,i));if("skip"===s.action)return void u();"object"==typeof s.config&&(n.instanceConfig=d.extend(n.instanceConfig,s.config))}else if("skip"===s)return void u()}var a=n.instanceConfig.complete;n.instanceConfig.complete=function(e){q(a)&&a(e,n.file,n.inputElem),u()},b.parse(n.file,n.instanceConfig)}else q(o.complete)&&o.complete()}function u(){h.splice(0,1),e()}}}function u(e){this._handle=null,this._finished=!1,this._completed=!1,this._halted=!1,this._input=null,this._baseIndex=0,this._partialLine="",this._rowCount=0,this._start=0,this._nextChunk=null,this.isFirstChunk=!0,this._completeResults={data:[],errors:[],meta:{}},function(e){var t=w(e);t.chunkSize=parseInt(t.chunkSize),e.step||e.chunk||(t.chunkSize=null);this._handle=new r(t),(this._handle.streamer=this)._config=t}.call(this,e),this.parseChunk=function(e,t){if(this.isFirstChunk&&q(this._config.beforeFirstChunk)){var r=this._config.beforeFirstChunk(e);void 0!==r&&(e=r)}this.isFirstChunk=!1,this._halted=!1;var i=this._partialLine+e;this._partialLine="";var n=this._handle.parse(i,this._baseIndex,!this._finished);if(!this._handle.paused()&&!this._handle.aborted()){var s=n.meta.cursor;this._finished||(this._partialLine=i.substring(s-this._baseIndex),this._baseIndex=s),n&&n.data&&(this._rowCount+=n.data.length);var a=this._finished||this._config.preview&&this._rowCount>=this._config.preview;if(o)f.postMessage({results:n,workerId:b.WORKER_ID,finished:a});else if(q(this._config.chunk)&&!t){if(this._config.chunk(n,this._handle),this._handle.paused()||this._handle.aborted())return void(this._halted=!0);n=void 0,this._completeResults=void 0}return this._config.step||this._config.chunk||(this._completeResults.data=this._completeResults.data.concat(n.data),this._completeResults.errors=this._completeResults.errors.concat(n.errors),this._completeResults.meta=n.meta),this._completed||!a||!q(this._config.complete)||n&&n.meta.aborted||(this._config.complete(this._completeResults,this._input),this._completed=!0),a||n&&n.meta.paused||this._nextChunk(),n}this._halted=!0},this._sendError=function(e){q(this._config.error)?this._config.error(e):o&&this._config.error&&f.postMessage({workerId:b.WORKER_ID,error:e,finished:!1})}}function l(e){var i;(e=e||{}).chunkSize||(e.chunkSize=b.RemoteChunkSize),u.call(this,e),this._nextChunk=n?function(){this._readChunk(),this._chunkLoaded()}:function(){this._readChunk()},this.stream=function(e){this._input=e,this._nextChunk()},this._readChunk=function(){if(this._finished)this._chunkLoaded();else{if(i=new XMLHttpRequest,this._config.withCredentials&&(i.withCredentials=this._config.withCredentials),n||(i.onload=y(this._chunkLoaded,this),i.onerror=y(this._chunkError,this)),i.open("GET",this._input,!n),this._config.downloadRequestHeaders){var e=this._config.downloadRequestHeaders;for(var t in e)i.setRequestHeader(t,e[t])}if(this._config.chunkSize){var r=this._start+this._config.chunkSize-1;i.setRequestHeader("Range","bytes="+this._start+"-"+r)}try{i.send()}catch(e){this._chunkError(e.message)}n&&0===i.status?this._chunkError():this._start+=this._config.chunkSize}},this._chunkLoaded=function(){4===i.readyState&&(i.status<200||400<=i.status?this._chunkError():(this._finished=!this._config.chunkSize||this._start>function(e){var t=e.getResponseHeader("Content-Range");if(null===t)return-1;return parseInt(t.substr(t.lastIndexOf("/")+1))}(i),this.parseChunk(i.responseText)))},this._chunkError=function(e){var t=i.statusText||e;this._sendError(new Error(t))}}function c(e){var i,n;(e=e||{}).chunkSize||(e.chunkSize=b.LocalChunkSize),u.call(this,e);var s="undefined"!=typeof FileReader;this.stream=function(e){this._input=e,n=e.slice||e.webkitSlice||e.mozSlice,s?((i=new FileReader).onload=y(this._chunkLoaded,this),i.onerror=y(this._chunkError,this)):i=new FileReaderSync,this._nextChunk()},this._nextChunk=function(){this._finished||this._config.preview&&!(this._rowCount<this._config.preview)||this._readChunk()},this._readChunk=function(){var e=this._input;if(this._config.chunkSize){var t=Math.min(this._start+this._config.chunkSize,this._input.size);e=n.call(e,this._start,t)}var r=i.readAsText(e,this._config.encoding);s||this._chunkLoaded({target:{result:r}})},this._chunkLoaded=function(e){this._start+=this._config.chunkSize,this._finished=!this._config.chunkSize||this._start>=this._input.size,this.parseChunk(e.target.result)},this._chunkError=function(){this._sendError(i.error)}}function p(e){var r;u.call(this,e=e||{}),this.stream=function(e){return r=e,this._nextChunk()},this._nextChunk=function(){if(!this._finished){var e=this._config.chunkSize,t=e?r.substr(0,e):r;return r=e?r.substr(e):"",this._finished=!r,this.parseChunk(t)}}}function m(e){u.call(this,e=e||{});var t=[],r=!0,i=!1;this.pause=function(){u.prototype.pause.apply(this,arguments),this._input.pause()},this.resume=function(){u.prototype.resume.apply(this,arguments),this._input.resume()},this.stream=function(e){this._input=e,this._input.on("data",this._streamData),this._input.on("end",this._streamEnd),this._input.on("error",this._streamError)},this._checkIsFinished=function(){i&&1===t.length&&(this._finished=!0)},this._nextChunk=function(){this._checkIsFinished(),t.length?this.parseChunk(t.shift()):r=!0},this._streamData=y(function(e){try{t.push("string"==typeof e?e:e.toString(this._config.encoding)),r&&(r=!1,this._checkIsFinished(),this.parseChunk(t.shift()))}catch(e){this._streamError(e)}},this),this._streamError=y(function(e){this._streamCleanUp(),this._sendError(e)},this),this._streamEnd=y(function(){this._streamCleanUp(),i=!0,this._streamData("")},this),this._streamCleanUp=y(function(){this._input.removeListener("data",this._streamData),this._input.removeListener("end",this._streamEnd),this._input.removeListener("error",this._streamError)},this)}function r(g){var a,o,h,i=Math.pow(2,53),n=-i,s=/^\s*-?(\d*\.?\d+|\d+\.?\d*)(e[-+]?\d+)?\s*$/i,u=/(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/,t=this,r=0,f=0,d=!1,e=!1,l=[],c={data:[],errors:[],meta:{}};if(q(g.step)){var p=g.step;g.step=function(e){if(c=e,_())m();else{if(m(),0===c.data.length)return;r+=e.data.length,g.preview&&r>g.preview?o.abort():p(c,t)}}}function v(e){return"greedy"===g.skipEmptyLines?""===e.join("").trim():1===e.length&&0===e[0].length}function m(){if(c&&h&&(k("Delimiter","UndetectableDelimiter","Unable to auto-detect delimiting character; defaulted to '"+b.DefaultDelimiter+"'"),h=!1),g.skipEmptyLines)for(var e=0;e<c.data.length;e++)v(c.data[e])&&c.data.splice(e--,1);return _()&&function(){if(!c)return;function e(e){q(g.transformHeader)&&(e=g.transformHeader(e)),l.push(e)}if(Array.isArray(c.data[0])){for(var t=0;_()&&t<c.data.length;t++)c.data[t].forEach(e);c.data.splice(0,1)}else c.data.forEach(e)}(),function(){if(!c||!g.header&&!g.dynamicTyping&&!g.transform)return c;function e(e,t){var r,i=g.header?{}:[];for(r=0;r<e.length;r++){var n=r,s=e[r];g.header&&(n=r>=l.length?"__parsed_extra":l[r]),g.transform&&(s=g.transform(s,n)),s=y(n,s),"__parsed_extra"===n?(i[n]=i[n]||[],i[n].push(s)):i[n]=s}return g.header&&(r>l.length?k("FieldMismatch","TooManyFields","Too many fields: expected "+l.length+" fields but parsed "+r,f+t):r<l.length&&k("FieldMismatch","TooFewFields","Too few fields: expected "+l.length+" fields but parsed "+r,f+t)),i}var t=1;!c.data[0]||Array.isArray(c.data[0])?(c.data=c.data.map(e),t=c.data.length):c.data=e(c.data,0);g.header&&c.meta&&(c.meta.fields=l);return f+=t,c}()}function _(){return g.header&&0===l.length}function y(e,t){return r=e,g.dynamicTypingFunction&&void 0===g.dynamicTyping[r]&&(g.dynamicTyping[r]=g.dynamicTypingFunction(r)),!0===(g.dynamicTyping[r]||g.dynamicTyping)?"true"===t||"TRUE"===t||"false"!==t&&"FALSE"!==t&&(function(e){if(s.test(e)){var t=parseFloat(e);if(n<t&&t<i)return!0}return!1}(t)?parseFloat(t):u.test(t)?new Date(t):""===t?null:t):t;var r}function k(e,t,r,i){c.errors.push({type:e,code:t,message:r,row:i})}this.parse=function(e,t,r){var i=g.quoteChar||'"';if(g.newline||(g.newline=function(e,t){e=e.substr(0,1048576);var r=new RegExp(U(t)+"([^]*?)"+U(t),"gm"),i=(e=e.replace(r,"")).split("\r"),n=e.split("\n"),s=1<n.length&&n[0].length<i[0].length;if(1===i.length||s)return"\n";for(var a=0,o=0;o<i.length;o++)"\n"===i[o][0]&&a++;return a>=i.length/2?"\r\n":"\r"}(e,i)),h=!1,g.delimiter)q(g.delimiter)&&(g.delimiter=g.delimiter(e),c.meta.delimiter=g.delimiter);else{var n=function(e,t,r,i,n){var s,a,o,h;n=n||[",","\t","|",";",b.RECORD_SEP,b.UNIT_SEP];for(var u=0;u<n.length;u++){var f=n[u],d=0,l=0,c=0;o=void 0;for(var p=new E({comments:i,delimiter:f,newline:t,preview:10}).parse(e),m=0;m<p.data.length;m++)if(r&&v(p.data[m]))c++;else{var _=p.data[m].length;l+=_,void 0!==o?0<_&&(d+=Math.abs(_-o),o=_):o=_}0<p.data.length&&(l/=p.data.length-c),(void 0===a||d<=a)&&(void 0===h||h<l)&&1.99<l&&(a=d,s=f,h=l)}return{successful:!!(g.delimiter=s),bestDelimiter:s}}(e,g.newline,g.skipEmptyLines,g.comments,g.delimitersToGuess);n.successful?g.delimiter=n.bestDelimiter:(h=!0,g.delimiter=b.DefaultDelimiter),c.meta.delimiter=g.delimiter}var s=w(g);return g.preview&&g.header&&s.preview++,a=e,o=new E(s),c=o.parse(a,t,r),m(),d?{meta:{paused:!0}}:c||{meta:{paused:!1}}},this.paused=function(){return d},this.pause=function(){d=!0,o.abort(),a=a.substr(o.getCharIndex())},this.resume=function(){t.streamer._halted?(d=!1,t.streamer.parseChunk(a,!0)):setTimeout(this.resume,3)},this.aborted=function(){return e},this.abort=function(){e=!0,o.abort(),c.meta.aborted=!0,q(g.complete)&&g.complete(c),a=""}}function U(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function E(e){var O,D=(e=e||{}).delimiter,I=e.newline,T=e.comments,A=e.step,L=e.preview,F=e.fastMode,z=O=void 0===e.quoteChar?'"':e.quoteChar;if(void 0!==e.escapeChar&&(z=e.escapeChar),("string"!=typeof D||-1<b.BAD_DELIMITERS.indexOf(D))&&(D=","),T===D)throw new Error("Comment character same as delimiter");!0===T?T="#":("string"!=typeof T||-1<b.BAD_DELIMITERS.indexOf(T))&&(T=!1),"\n"!==I&&"\r"!==I&&"\r\n"!==I&&(I="\n");var M=0,j=!1;this.parse=function(a,r,t){if("string"!=typeof a)throw new Error("Input must be a string");var i=a.length,e=D.length,n=I.length,s=T.length,o=q(A),h=[],u=[],f=[],d=M=0;if(!a)return R();if(F||!1!==F&&-1===a.indexOf(O)){for(var l=a.split(I),c=0;c<l.length;c++){if(f=l[c],M+=f.length,c!==l.length-1)M+=I.length;else if(t)return R();if(!T||f.substr(0,s)!==T){if(o){if(h=[],b(f.split(D)),S(),j)return R()}else b(f.split(D));if(L&&L<=c)return h=h.slice(0,L),R(!0)}}return R()}for(var p=a.indexOf(D,M),m=a.indexOf(I,M),_=new RegExp(U(z)+U(O),"g"),g=a.indexOf(O,M);;)if(a[M]!==O)if(T&&0===f.length&&a.substr(M,s)===T){if(-1===m)return R();M=m+n,m=a.indexOf(I,M),p=a.indexOf(D,M)}else{if(-1!==p&&(p<m||-1===m)){if(-1===g){f.push(a.substring(M,p)),M=p+e,p=a.indexOf(D,M);continue}var v=x(p,g,m);if(v&&void 0!==v.nextDelim){p=v.nextDelim,g=v.quoteSearch,f.push(a.substring(M,p)),M=p+e,p=a.indexOf(D,M);continue}}if(-1===m)break;if(f.push(a.substring(M,m)),C(m+n),o&&(S(),j))return R();if(L&&h.length>=L)return R(!0)}else for(g=M,M++;;){if(-1===(g=a.indexOf(O,g+1)))return t||u.push({type:"Quotes",code:"MissingQuotes",message:"Quoted field unterminated",row:h.length,index:M}),w();if(g===i-1)return w(a.substring(M,g).replace(_,O));if(O!==z||a[g+1]!==z){if(O===z||0===g||a[g-1]!==z){var y=E(-1===m?p:Math.min(p,m));if(a[g+1+y]===D){f.push(a.substring(M,g).replace(_,O)),a[M=g+1+y+e]!==O&&(g=a.indexOf(O,M)),p=a.indexOf(D,M),m=a.indexOf(I,M);break}var k=E(m);if(a.substr(g+1+k,n)===I){if(f.push(a.substring(M,g).replace(_,O)),C(g+1+k+n),p=a.indexOf(D,M),g=a.indexOf(O,M),o&&(S(),j))return R();if(L&&h.length>=L)return R(!0);break}u.push({type:"Quotes",code:"InvalidQuotes",message:"Trailing quote on quoted field is malformed",row:h.length,index:M}),g++}}else g++}return w();function b(e){h.push(e),d=M}function E(e){var t=0;if(-1!==e){var r=a.substring(g+1,e);r&&""===r.trim()&&(t=r.length)}return t}function w(e){return t||(void 0===e&&(e=a.substr(M)),f.push(e),M=i,b(f),o&&S()),R()}function C(e){M=e,b(f),f=[],m=a.indexOf(I,M)}function R(e,t){return{data:t||!1?h[0]:h,errors:u,meta:{delimiter:D,linebreak:I,aborted:j,truncated:!!e,cursor:d+(r||0)}}}function S(){A(R(void 0,!0)),h=[],u=[]}function x(e,t,r){var i={nextDelim:void 0,quoteSearch:void 0},n=a.indexOf(O,t+1);if(t<e&&e<n&&(n<r||-1===r)){var s=a.indexOf(D,n);if(-1===s)return i;n<s&&(n=a.indexOf(O,n+1)),i=x(s,n,r)}else i={nextDelim:e,quoteSearch:t};return i}},this.abort=function(){j=!0},this.getCharIndex=function(){return M}}function _(e){var t=e.data,r=a[t.workerId],i=!1;if(t.error)r.userError(t.error,t.file);else if(t.results&&t.results.data){var n={abort:function(){i=!0,g(t.workerId,{data:[],errors:[],meta:{aborted:!0}})},pause:v,resume:v};if(q(r.userStep)){for(var s=0;s<t.results.data.length&&(r.userStep({data:t.results.data[s],errors:t.results.errors,meta:t.results.meta},n),!i);s++);delete t.results}else q(r.userChunk)&&(r.userChunk(t.results,n,t.file),delete t.results)}t.finished&&!i&&g(t.workerId,t.results)}function g(e,t){var r=a[e];q(r.userComplete)&&r.userComplete(t),r.terminate(),delete a[e]}function v(){throw new Error("Not implemented.")}function w(e){if("object"!=typeof e||null===e)return e;var t=Array.isArray(e)?[]:{};for(var r in e)t[r]=w(e[r]);return t}function y(e,t){return function(){e.apply(t,arguments)}}function q(e){return"function"==typeof e}return o&&(f.onmessage=function(e){var t=e.data;void 0===b.WORKER_ID&&t&&(b.WORKER_ID=t.workerId);if("string"==typeof t.input)f.postMessage({workerId:b.WORKER_ID,results:b.parse(t.input,t.config),finished:!0});else if(f.File&&t.input instanceof File||t.input instanceof Object){var r=b.parse(t.input,t.config);r&&f.postMessage({workerId:b.WORKER_ID,results:r,finished:!0})}}),(l.prototype=Object.create(u.prototype)).constructor=l,(c.prototype=Object.create(u.prototype)).constructor=c,(p.prototype=Object.create(p.prototype)).constructor=p,(m.prototype=Object.create(u.prototype)).constructor=m,b});

    /* end csv-parser */

    scriptVars.papaParse = Papa;
	
	callFuncOnDocumentReady(runMain, false);

})(tamperMonkeyScriptVars_d09e64b3_e662_459f_a079_a070b7805508 || (tamperMonkeyScriptVars_d09e64b3_e662_459f_a079_a070b7805508 = {}));
