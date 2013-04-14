/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, browser: true, nomen: true,
indent: 4, maxerr: 50 */
/*global define, describe, it, xit, expect, beforeEach, afterEach, waits,
waitsFor, runs, $, brackets, waitsForDone, spyOn */
/*unittests: ExtensionMgr*/

define(function (require, exports, module) {
    "use strict";
    
    require("thirdparty/jquery.mockjax.js");
    
    var ExtensionMgrModel = require("extensibility/ExtensionMgrModel").ExtensionMgrModel,
        ExtensionMgrView  = require("extensibility/ExtensionMgrView").ExtensionMgrView,
        SpecRunnerUtils   = require("spec/SpecRunnerUtils"),
        CollectionUtils   = require("utils/CollectionUtils"),
        mockRegistryText  = require("text!spec/ExtensionMgr-test-files/mockRegistry.json"),
        mockRegistry      = JSON.parse(mockRegistryText);
    
    describe("ExtensionMgr", function () {
        var model, mockId, mockSettings;
        
        beforeEach(function () {
            model = new ExtensionMgrModel();
            
            // Return a canned registry when requested.
            mockSettings = {
                url: brackets.config.extension_registry,
                dataType: "json",
                contentType: "application/json",
                response: function () {
                    this.responseText = mockRegistry;
                }
            };
            spyOn(mockSettings, "response").andCallThrough();
            mockId = $.mockjax(mockSettings);
        });
        
        afterEach(function () {
            $.mockjaxClear(mockId);
            model = null;
        });
        
        describe("ExtensionMgrModel", function () {
            it("should download the extension list from the registry", function () {
                var registry;
                runs(function () {
                    model.getRegistry()
                        .done(function (result) {
                            registry = result;
                        });
                });
                waitsFor(function () { return registry; }, "fetching registry");
    
                runs(function () {
                    expect(mockSettings.response).toHaveBeenCalled();
                    expect(registry).toEqual(mockRegistry);
                });
            });
    
            it("should return the registry but not re-download it if called twice without forceDownload", function () {
                var registry;
                runs(function () {
                    waitsForDone(model.getRegistry(), "fetching registry");
                });
    
                runs(function () {
                    expect(mockSettings.response.callCount).toBe(1);
                    model.getRegistry()
                        .done(function (result) {
                            registry = result;
                        });
                });
                waitsFor(function () { return registry; }, "re-getting registry");
                
                runs(function () {
                    expect(mockSettings.response.callCount).toBe(1);
                    expect(registry).toEqual(mockRegistry);
                });
            });
    
            it("should re-download the registry if called twice with forceDownload", function () {
                var registry;
                runs(function () {
                    waitsForDone(model.getRegistry(), "fetching registry");
                });
    
                runs(function () {
                    expect(mockSettings.response.callCount).toBe(1);
                    model.getRegistry(true)
                        .done(function (result) {
                            registry = result;
                        });
                });
                waitsFor(function () { return registry; }, "re-getting registry");
                
                runs(function () {
                    expect(mockSettings.response.callCount).toBe(2);
                    expect(registry).toEqual(mockRegistry);
                });
            });
            
            it("should fail if it can't access the registry", function () {
                var gotDone = false, gotFail = false;
                runs(function () {
                    $.mockjaxClear(mockId);
                    mockId = $.mockjax({
                        url: brackets.config.extension_registry,
                        isTimeout: true
                    });
                    model.getRegistry(true)
                        .done(function () {
                            gotDone = true;
                        })
                        .fail(function () {
                            gotFail = true;
                        });
                });
                waitsFor(function () { return gotDone || gotFail; }, "mock failure");
                
                runs(function () {
                    expect(gotFail).toBe(true);
                    expect(gotDone).toBe(false);
                });
            });
        });
        
        describe("ExtensionMgrView", function () {
            var testWindow, view, $container;
            
            beforeEach(function () {
                this.addMatchers({
                    toHaveText: function (expected) {
                        var notText = this.isNot ? " not" : "";
                        this.message = function () {
                            return "Expected view" + notText + " to contain text " + expected;
                        };
                        return SpecRunnerUtils.findDOMText(this.actual.$el, expected);
                    }
                });
                
                // Prefetch the model so the view is constructed immediately. (mockjax appears to
                // add a little asynchronicity even if it's returning data right away.)
                var model;
                runs(function () {
                    model = new ExtensionMgrModel();
                    waitsForDone(model.getRegistry());
                });
                runs(function () {
                    $container = SpecRunnerUtils.createMockElement();
                    view = new ExtensionMgrView(model);
                    $container.append(view.$el);
                });
            });
            
            afterEach(function () {
                $container.remove();
                $container = null;
                view = null;
            });
            
            it("should populate itself with registry entries and display their fields when created", function () {
                CollectionUtils.forEach(mockRegistry, function (item) {
                    // Should show the title if specified, otherwise the bare name.
                    if (item.metadata.title) {
                        expect(view).toHaveText(item.metadata.title);
                    } else {
                        expect(view).toHaveText(item.metadata.name);
                    }
                    
                    // Simple fields
                    [item.metadata.version,
                        item.metadata.author && item.metadata.author.name,
                        item.metadata.description]
                        .forEach(function (value) {
                            if (value) {
                                expect(view).toHaveText(value);
                            }
                        });
                    
                    // Array-valued fields
                    [item.metadata.keywords, item.metadata.categories].forEach(function (arr) {
                        if (arr) {
                            arr.forEach(function (value) {
                                expect(view).toHaveText(value);
                            });
                        }
                    });
                    
                    // Owner--should show the parts, but might format them separately
                    item.owner.split(":").forEach(function (part) {
                        expect(view).toHaveText(part);
                    });
                });
            });
        });
    });
});