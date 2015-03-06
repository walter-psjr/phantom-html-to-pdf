/*!
 * Copyright(c) 2014 Jan Blaha
 *
 * Phantomjs script responsible for converting html into pdf.
 */
/* globals phantom */


var webpage = require('webpage');
var webserver = require('webserver').create();
var system = require('system');
var fs = require('fs');
var port = system.stdin.readLine();

var service = webserver.listen('127.0.0.1:' + port, function (req, res) {
    try {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');

        var body = JSON.parse(req.post);

        var page = webpage.create();
        page.viewportSize = {
            width: body.viewportSize.width || 600,
            height: body.viewportSize.height ||600
        };

        page.settings.javascriptEnabled = body.settings.javascriptEnabled !== false;

        page.onResourceRequested = function (request, networkRequest) {
            if (request.url.lastIndexOf(body.url, 0) === 0) {
                return;
            }

            //potentially dangerous request
            if (request.url.lastIndexOf("file:///", 0) === 0 && !body.allowLocalFilesAccess) {
                networkRequest.abort();
                return;
            }

            //to support cdn like format //cdn.jquery...
            if (request.url.lastIndexOf("file://", 0) === 0 && request.url.lastIndexOf("file:///", 0) !== 0) {
                networkRequest.changeUrl(request.url.replace("file://", "http://"));
            }
        };

        page.open(body.url, function () {
            var phantomHeader = page.evaluate(function (s) {
                return document.querySelector(s) ? document.querySelector(s).innerHtml : null;
            }, '#phantomHeader');

            var phantomFooter = page.evaluate(function (s) {
                return document.querySelector(s) ? document.querySelector(s).innerHtml : null;
            }, '#phantomFooter');

            var numberOfPages = 0;

            page.paperSize = {
                format: body.paperSize.format || "",
                orientation: body.paperSize.orientation,
                margin: body.paperSize.margin || "1cm",
                width: body.paperSize.width || undefined,
                height: body.paperSize.height || undefined,
                header: {
                    height: body.paperSize.headerHeight || ((phantomHeader || body.headerFile) ? "1cm" : "1mm"),
                    contents: phantom.callback(function (pageNum, numPages) {
                        numberOfPages = numPages;

                        if (!phantomHeader && !body.paperSize.headerFile)
                            return "<span></span>";

                        if (!phantomHeader) {
                            var stream = fs.open(body.paperSize.headerFile, "r");
                            phantomHeader = stream.read();
                            stream.close();
                        }

                        return phantomHeader.replace(/{#pageNum}/g, pageNum).replace(/{#numPages}/g, numPages);
                    })
                },
                footer: (body.paperSize.footerFile || phantomFooter) ? {
                    height: body.paperSize.footerHeight || "1cm",
                    contents: phantom.callback(function (pageNum, numPages) {
                        if (!phantomFooter) {
                            var stream = fs.open(body.paperSize.footerFile, "r");
                            phantomFooter = stream.read();
                            stream.close();
                        }

                        return phantomFooter.replace(/{#pageNum}/g, pageNum).replace(/{#numPages}/g, numPages);
                    })
                } : undefined
            };

            if (body.customHeaders) {
                page.customHeaders = body.customHeaders;
            }

            setTimeout(function() {
                page.render(body.output);

                res.statusCode = 200;

                res.write(numberOfPages);
                res.close();
            }, body.printDelay || 0);
        });
    } catch (e) {
        system.stdout.writeLine(JSON.stringify(e));
        res.statusCode = 500;
        res.write(JSON.stringify(e));
        res.close();
    }
});