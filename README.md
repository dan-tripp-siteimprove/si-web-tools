This repo relies on another repo to minify the bookmarklet.  
i.e. /home/dtr/MiscJsUtil/minify-bookmarklet.bash ./quick-links-bookmarklet.js 
And that "quick links" script might not work unless it's minified.  i.e. "minify" might do more than just minify.  It might do some crucial escaping (of JS comments IIRC.) 
Sorry for the mess. 
