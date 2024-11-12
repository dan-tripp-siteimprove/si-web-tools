javascript:
var bookmarkletVars_0eed7a59_cf6e_4254_aa0a_798a6332b6f1;
(async function (bookmarkletVars) {

	/* 

	- test plan:
		- both datacenters 
		- chrome, ff 

	to do: "open in new tab" icons: hover, focus, and active styles.  and disabled. 
		- DON'T DO b/c these rely on adding a "style" element and that gets blocked 
			under some CSPs.  even though the quick links bookmarklet will usually be 
			run from the platform, which doesn't currently have a CSP which causes a 
			problem, I don't want to bother. 


	*/

	function getAccountIdWhenWeAreOnAPlatformPageReport() {
		let r;
		for (let script of document.querySelectorAll('script')) {
			let scriptContent = script.textContent || script.innerText;
			let match = scriptContent.match(/sz.*push.*customerid.*?(\d+)/);
			if (match) {
				r = match[1];
				break;
			}
		}
		if(!r) {
			throw new Error();
		}
		return r;
	}

	function getCustomerPageUrlWhenWeAreOnAPlatformPageReport() {
		let r = document.querySelectorAll('.inspector-info a');
		if(r.length < 1) throw new Error();
		r = r[0].href;
		return r;
	}


	function getAccountIdWhenWeAreOnPlatformPageThatIsNotAPageReport() {
		let r = document.querySelector('html head meta[name="accountId"]')?.getAttribute('value');
		return r;
	}

	/* To my surprise, this part of the page content in this case contains a global site ID.  
	not a QA site ID.  even though it's the QA site ID that is used in most platform URLs. */
	function getGlobalSiteIdWhenWeAreOnPlatformPageThatIsNotAPageReport() {
		let r = document.querySelector('html head meta[name="siteId"]')?.getAttribute('value');
		return r;
	}

	function getQaSiteIdWhenWeAreOnPlatformPageThatIsNotAPageReport() {
		let r;
		for(let e of document.querySelectorAll('a[href^="/QualityAssurance/"]')) {
			let match = e.href.match(/\/QualityAssurance\/(\d+)\//);
			if(match) {
				r = match[1];
				break;
			}
		}
		return r;
	}

	function getSupportToolDomain(datacenter_) {
		let r = {'eu':'supporttool.siteimprove.com', 'us':'ussupporttool.siteimprove.com'}[datacenter_];
		return r;
	}

	function getSupportToolSiteConfigUrl(datacenter_, accountId_, qaSiteId_) {
		let r = `https://${getSupportToolDomain(datacenter_)}/QA/Configuration.aspx?accountid=${accountId_}`+
			`&qasiteid=${qaSiteId_}`;
		return r;
	}


	function getSupportToolSiteCrawlHistoryUrl(datacenter_, accountId_, qaSiteId_) {
		let r = `https://${getSupportToolDomain(datacenter_)}/QA/Crawl/History/Default.aspx?`+
			`accountid=${accountId_}&qasiteid=${qaSiteId_}`;
		return r;
	}


	function areWeOnAPlatformPageReport() {
		let r = (new URL(window.location.href)).pathname.startsWith('/Inspector/');
		return r;
	}

	function areWeOnAPlatformQAInspectorPage() {
		let r = (new URL(window.location.href)).pathname.startsWith('/QualityAssurance/Inspector/');
		return r;
	}

	function getSiteIdWhenWeAreOnAPlatformPageReport(pageReportUrl_) {
		let r = pageReportUrl_.match(/\/Inspector\/(\d+)\//)[1];
		return r;
	}

	function go() {
		createAndShowPopup();
	}

	function makeOpenInNewTabSvgElem(disabled_) {
		let color = disabled_ ? '#aaa' : '#3C485E';
		let r = `<svg width="1.5em" version="1.1" xmlns="http://www.w3.org/2000/svg" 
				xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"> 
			<g fill="${color}"> 
				<path d="M2.3,3.5C1,3.5,0,4.5,0,5.8v15.9C0,23,1,24,2.3,24h15.9c1.3,0,2.3-1,2.3-2.3v-6.8l-2.3-2.3v9.1H2.3V5.8h9.1 L9.1,3.5H2.3z"/> 
				<polygon points="16,0 19.1,3 10.5,11.6 12.4,13.5 21,4.9 24,8 24,0 "/> 
			</g> 
		</svg>`;
		r = (new DOMParser()).parseFromString(r, 'image/svg+xml');
		r = r.documentElement;
		return r;
	}

	function areWeOnAPlatformPage() {
		let hostnames = ['my2.siteimprove.com', 'my2.us.siteimprove.com'];
		let r = hostnames.includes(window.location.hostname);
		return r;
	}

	function areWeOnASupportToolPage() {
		let hostnames = ['supporttool.siteimprove.com', 'ussupporttool.siteimprove.com'];
		let r = hostnames.includes(window.location.hostname);
		return r;
	}

	function getAccountIdWhenWeAreOnASupportToolPage() {
		let params = new URLSearchParams(window.location.search);
		let r = params.get('accountid');
		// ^ this will handle a url like https://supporttool.siteimprove.com/QA/Crawl/History/Default.aspx?accountid=6234848&qasiteid=1164430 
		if(!r) {
			// this will handle a url like https://supporttool.siteimprove.com/Pickers/SitePicker.aspx?ref=%2fQA%2fCrawl%2fHistory%2fDefault.aspx%3faccountid%3d6234848&pagesize=200  
			let match = window.location.href.match(/accountid%3d(\d+)/);
			if(match) {
				r = match[1];
			}
		}
		return r;
	}

	function getSiteIdWhenWeAreOnASupportToolPage() {
		let params = new URLSearchParams(window.location.search);
		let r = params.get('qasiteid');
		return r;
	}

	/* This function does this: 
		1) elem_.setProperty('color', 'red', 'important') 
	instead of this: 
		2) elem_.style = 'color: red !important;';
	or this:
		3) let ourStyleElem = document.createElement('style');
		   document.head.appendChild(ourStyleElem);
		   ourStyleElem.innerText = ".ourclass { color: red !important }";
		   newElem.setAttribute('class', 'ourclass');
	because technique 1 works under certain restrictive CSPs (AKA Content Security Policy) like 
	https://www.gov.uk/ has (late 2023).  and the second and third techniques don't.  
	Many other parts of a bookmarklet wil work, such as adding elements.  Even adding the 'style' 
	element in technique 3 will add it to the DOM, but it won't take effect.  
	
	Techniques 2 and 3 will generate an error message in the console - not throw an exception - 
	and the script will continue running.

	on chrome it generates this error message: 
		Refused to apply inline style because it violates the following Content Security Policy directive: "style-src 'self' www.gstatic.com". Either the 'unsafe-inline' keyword, a hash ('sha256-7p38K8uck+NOgLvGNCMM+io3dewhjgnKvoVLeTlcSwI='), or a nonce ('nonce-...') is required to enable inline execution. Note that hashes do not apply to event handlers, style attributes and javascript: navigations unless the 'unsafe-hashes' keyword is present.

	on firefox it generates this error message: 
		Content-Security-Policy: The page’s settings blocked the loading of a resource at inline (“style-src”).

	This technique will also work, but we don't use it, b/c we can't specify "important": 
		4) elem_.style.color = "red";
	*/
	function setInlineStyle(elem_, cssPropToValue_) {
		for(let [prop, value] of Object.entries(cssPropToValue_)) {
			elem_.style.setProperty(prop, value, 'important');
		}
	}

	function getPageIdWhenWeAreOnAPlatformPageReport(pageReportUrl_) {
		let params = new URLSearchParams((new URL(pageReportUrl_)).search);
		let r = params.get('pageId') || params.get('PageId') || null;
		return r;
	}

	function getPageIdWhenWeAreOnAPlatformQAInspectorPage(pageReportUrl_) {
		let r = (new URL(pageReportUrl_)).pathname.match(/\/QualityAssurance\/Inspector\/\d+\/(\d+)\//)[1];
		return r;
	}

	function createAndShowPopup() {
		let divElem = document.createElement('div');
		document.body.appendChild(divElem);
		let linkNameToUrl = {};
		let accountId, qaSiteId, customerPageUrl;
		let currentUrl = window.location.href;
		let datacenter;
		if(areWeOnAPlatformPage() || areWeOnASupportToolPage()) {
			datacenter = getDatacenterOfCurPage();
			if(areWeOnAPlatformPageReport()) {
				accountId = getAccountIdWhenWeAreOnAPlatformPageReport();
				qaSiteId = getSiteIdWhenWeAreOnAPlatformPageReport(currentUrl);
				customerPageUrl = getCustomerPageUrlWhenWeAreOnAPlatformPageReport();
			} else if(areWeOnASupportToolPage()) {
				accountId = getAccountIdWhenWeAreOnASupportToolPage();
				qaSiteId = getSiteIdWhenWeAreOnASupportToolPage();
			} else {
				accountId = getAccountIdWhenWeAreOnPlatformPageThatIsNotAPageReport();
				qaSiteId = getQaSiteIdWhenWeAreOnPlatformPageThatIsNotAPageReport();
			}
			let urlSiteIdPartOrNot = qaSiteId ? `%2F${qaSiteId}` : '';
			let platformHostname = getPlatformHostname(datacenter);
			let a11yIssuesUrl = `https://${platformHostname}/Auth/Direct?accountId=${accountId}&back=%2FAccessibility${urlSiteIdPartOrNot}%2FNextGen%2FIssuesOverview%2F1%3Fconformance%3D%26pageSegments%3D%26issueKind%3D1%26difficulty%3D%26elementType%3D%26responsibility%3D%26exceptTags%3D%26includingTags%3D%26tagFilterType%3D2%26lang%3Den-GB`;
			linkNameToUrl['platform > accessibility > issues'] = a11yIssuesUrl;
			let falsePositiveReportsUrl = `https://${platformHostname}/Auth/Direct?accountId=${accountId}&back=%2FSupportTools%2FA11YSupport%2FDecisionSupport`;
			linkNameToUrl['platform > false positive reports'] = falsePositiveReportsUrl;

			let pageId = null;
			if(areWeOnAPlatformPageReport()) {
				pageId = getPageIdWhenWeAreOnAPlatformPageReport(currentUrl);
			} else if(areWeOnAPlatformQAInspectorPage()) {
				pageId = getPageIdWhenWeAreOnAPlatformQAInspectorPage(currentUrl);
			}
			if(pageId) {
				linkNameToUrl['platform > qa > inventory > pages (inspector) > page overview'] = 
					`https://${platformHostname}/Auth/Direct?accountId=${accountId}&back=%2F`+
					`QualityAssurance%2FInspector%2F${qaSiteId}%2F${pageId}%2FPage%2FIndex%3Flang%3Den-GB`;
				linkNameToUrl['platform > qa > inventory > pages (inspector) > referring pages'] = 
					`https://${platformHostname}/Auth/Direct?accountId=${accountId}&back=%2F`+
					`QualityAssurance%2FInspector%2F${qaSiteId}%2F${pageId}%2FReferringPages%2FIndex%3`+
					`Flang%3Den-GB`;
			} else {
				linkNameToUrl['platform > qa > inventory > pages (inspector) > page overview'] = '';
				linkNameToUrl['platform > qa > inventory > pages (inspector) > referring pages'] = ''
			}
			linkNameToUrl['platform > qa > inventory > pages'] = `https://${platformHostname}/Auth/Direct?`+
				`accountId=${accountId}&back=%2FQualityAssurance%2F${qaSiteId}%2FInventory%2FPages%3Flang`+
				`%3Den-US`;

			let settingsSitesUrl = `https://${platformHostname}/Auth/Direct?accountId=${accountId}&back=%2FSettings%2FSites%2Fv2%3Flang%3Den-GB`;
			linkNameToUrl['platform > settings > sites'] = settingsSitesUrl;
			linkNameToUrl['platform > settings > crawler management > site overview (JS/non-JS)'] = 
				`https://${platformHostname}/Auth/Direct?accountId=${accountId}&back=%2FSettings%2F`+
				`CrawlerManagement%2FOverview%3Flang%3Den-US`;
			linkNameToUrl['platform > settings > crawler management > scan history'] = 
				`https://${platformHostname}/Auth/Direct?accountId=${accountId}&back=%2FSettings%2FCrawlerManagement%2FHistory${urlSiteIdPartOrNot}%3Flang%3Den-GB`;

			if(accountId && qaSiteId) {
				let currentUrl = window.location.href;
				linkNameToUrl['supporttool > site X > site config'] = 
					getSupportToolSiteConfigUrl(datacenter, accountId, qaSiteId);
				linkNameToUrl['supporttool > site X > crawl history'] = 
					getSupportToolSiteCrawlHistoryUrl(datacenter, accountId, qaSiteId);				
			} else {
				linkNameToUrl['supporttool > site X > site config'] = '';
				linkNameToUrl['supporttool > site X > crawl history'] = '';			
			}
		} 

		divElem.style = `position: fixed; top: 0;  left: 50%; 
			transform: translateX(-50%);    background: #fff; border: 2px solid black ; 
			padding: 10px; z-index: 999999;`;
		divElem.appendChild(createAccountIdTextFieldAndCloseButtonDiv(datacenter, accountId, divElem));
		for(let [linkName, url] of Object.entries(linkNameToUrl)) {
			let mainLinkElem = document.createElement('a');
			divElem.appendChild(mainLinkElem);
			mainLinkElem.innerText = `${linkName}`;

			divElem.appendChild(document.createTextNode('\u00A0\u00A0\u00A0\u00A0\u00A0  '));

			let newTabLinkElem = document.createElement('a');
			divElem.appendChild(newTabLinkElem);
			newTabLinkElem.target = '_blank';
			let disabled = !url;
			newTabLinkElem.appendChild(makeOpenInNewTabSvgElem(disabled));

			if(disabled) {
				setInlineStyle(mainLinkElem, {'color':'#888'});
				mainLinkElem.setAttribute('aria-disabled', 'true');
				newTabLinkElem.setAttribute('aria-disabled', 'true');
			} else {
				mainLinkElem.href = url;
				newTabLinkElem.href = url;
			}

			divElem.appendChild(document.createElement('br'));
		}

		function deleteOurPopup() {
			divElem.parentElement.removeChild(divElem);
		}
		for(let e of divElem.querySelectorAll('a')) {
			e.addEventListener("click", deleteOurPopup);
		}
	}

	function createAccountIdTextFieldAndCloseButtonDiv(datacenter_, accountId_, 
			elemToRemoveOnCloseButtonClicked_) {
		let r = parseHtmlElementStr(`<div>		
				<button name="close" title="close" aria-label="close" 
						style="float: right; margin: 0.2vw; z-index: 10; font-size: 1.0vw ; 
						border-width: 0.3vw; padding: 0.3vw; margin: 0.1vw" 
					>✖</button>	 
				<fieldset style="display: inline-block">
					<legend>Account ID:</legend>
					<input type="text"/>
				</fieldset>
				<fieldset style="display: inline-block">
					<legend>Datacenter:</legend>
					<label><input type="radio" name="datacenter" />EU</label>
					<label><input type="radio" name="datacenter" />US</label>
				</fieldset>
				<button name="go" style="border: 3px solid #999;" 
  						onfocus="this.style.border = '3px solid #555';"
  						onblur="this.style.border = '3px solid #999';">
					Go</button>
			</div>
			<hr>`);

		let accountIdInputElem = r.querySelector('input[type="text"]');
		if(accountId_) accountIdInputElem.value = accountId_;

		let datacenterRadioButtons = r.querySelectorAll('input[type="radio"]');
		let euDatacenterRadioButton = datacenterRadioButtons[0], 
			usDatacenterRadioButton = datacenterRadioButtons[1];
		if(datacenter_) { 
			let radioButton = {'eu': euDatacenterRadioButton, 'us':usDatacenterRadioButton}[datacenter_];
			radioButton.checked = true;
		} else {
			euDatacenterRadioButton.checked = true;
		}

		let closeButton = r.querySelector('button[name="close"]');
		function closeButtonClickListener() {
			elemToRemoveOnCloseButtonClicked_.remove();
		}
		closeButton.addEventListener("click", closeButtonClickListener);


		let goButton = r.querySelector('button[name="go"]');
		function goButtonClickListener() {
			let accountId = accountIdInputElem.value;
			let datacenter = euDatacenterRadioButton.checked ? 'eu' : 'us';
			goToAccountIdPage(accountId, datacenter);
		}
		goButton.addEventListener("click", goButtonClickListener);
		function goButtonSimulatingKeyListener(event__) {
			if (event__.key === "Enter") {
				goButton.click();
			}
		}
		for(let formField of [accountIdInputElem, euDatacenterRadioButton, usDatacenterRadioButton]) {
			formField.addEventListener("keyup", goButtonSimulatingKeyListener);
		}
		return r;
	}

	function getDatacenterOfCurPage() {
		let r;
		if(areWeOnAPlatformPage()) {
			r = getDatacenterWhenCurPageIsAPlatformPage();
		} else if(areWeOnASupportToolPage()) {
			r = getDatacenterWhenCurPageIsASupportToolPage();
		}
		return r;
	}

	function goToAccountIdPage(accountId_, datacenter_) {
		let accountId = accountId_?.trim();
		if(!accountId) return;
		if(!/^\d+$/.test(accountId)) {
			alert('Invalid account ID.');
			return;
		}
		if(!["eu", "us"].includes(datacenter_)) {
			throw new Error('invalid datacenter');
		}
		let newUrl = `https://${getPlatformHostname(datacenter_)}/Auth/Direct?accountId=${accountId}&back=%2FSettings%2FUsers%2FPasswordPolicy%3Flang%3Den-US`;
		/* ^^ chose that 'Password requirements' page on the theory that it will load quickly 
		b/c it doesn't show any data that scales eg. sites, crawls, false positive reports.  
		still it sometimes takes a while eg. 18 seconds on account 8343. */
		window.location.href = newUrl;
	}

	
	function getPlatformHostname(datacenter_) {
		let r = {'eu':'my2.siteimprove.com', 'us':'my2.us.siteimprove.com'}[datacenter_];
		return r;
	}

	function parseHtmlElementStr(str_) {
		const parser = new DOMParser();
		const parsedDocument = parser.parseFromString(str_, 'text/html');
		const r = parsedDocument.body.firstChild;
		return r;
	}

	function getDatacenterWhenCurPageIsAPlatformPage() {
		let url = window.location.href;
		if(/^https?:\/\/my2\.siteimprove\.com/.test(url)) {
			return 'eu';
		} else if(/^https?:\/\/my2\.us\.siteimprove\.com/.test(url)) {
			return 'us';
		} else {
			throw new Error('failed to get datacenter');
		}
	}

	function getDatacenterWhenCurPageIsASupportToolPage() {
		if(window.location.hostname === 'supporttool.siteimprove.com') {
			return 'eu';
		} else if(window.location.hostname === 'ussupporttool.siteimprove.com') {
			return 'us';
		} else {
			throw new Error('failed to get datacenter');
		}
	}

	function callBookmarkletFuncOnDocReady(func_, runIfWeAreInAnIframe_) {
		if(!runIfWeAreInAnIframe_) {
			let areWeInAnIframe = window.self !== window.top;
			if(areWeInAnIframe) return;
		}
		if(document.readyState == "complete") {
			/* This will probably happen if we're running as a bookmarklet.  i.e. it's now 
			well after page load is finished. */
			func_();
		} else {
			/* This will happen if we're running as a tampermonkey script 
			via "@require".  i.e. it's now well before page load is finished. */
			document.addEventListener("readystatechange", (event__) => {
				if(document.readyState === "complete") {
					func_();
				}
			});
		}
	}

	callBookmarkletFuncOnDocReady(go, false);

})(bookmarkletVars_0eed7a59_cf6e_4254_aa0a_798a6332b6f1 || (bookmarkletVars_0eed7a59_cf6e_4254_aa0a_798a6332b6f1 = {}));
