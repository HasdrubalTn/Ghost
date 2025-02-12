const should = require('should');
const sinon = require('sinon');
const settingsCache = require('../../../../../core/shared/settings-cache');
const models = require('../../../../../core/server/models');
const urlUtils = require('../../../../../core/shared/url-utils');
const urlService = require('../../../../../core/server/services/url');
const labs = require('../../../../../core/shared/labs');

const {parseReplacements, renderEmailForSegment, _getTemplateSettings, createUnsubscribeUrl, createPostSignupUrl} = require('../../../../../core/server/services/mega/post-email-serializer');

describe('Post Email Serializer', function () {
    it('creates replacement pattern for valid format and value', function () {
        const html = '<html>Hey %%{first_name}%%, what is up?</html>';
        const plaintext = 'Hey %%{first_name}%%, what is up?';

        const replaced = parseReplacements({
            html,
            plaintext
        });

        replaced.length.should.equal(2);
        replaced[0].format.should.equal('html');
        replaced[0].recipientProperty.should.equal('member_first_name');

        replaced[1].format.should.equal('plaintext');
        replaced[1].recipientProperty.should.equal('member_first_name');
    });

    it('does not create replacements for unsupported variable names', function () {
        const html = '<html>Hey %%{last_name}%%, what is up?</html>';
        const plaintext = 'Hey %%{age}%%, what is up?';

        const replaced = parseReplacements({
            html,
            plaintext
        });

        replaced.length.should.equal(0);
    });

    describe('renderEmailForSegment', function () {
        afterEach(function () {
            sinon.restore();
        });

        it('shouldn\'t change an email that has no member segment', function () {
            const email = {
                otherProperty: true,
                html: '<div>test</div>',
                plaintext: 'test'
            };

            let output = renderEmailForSegment(email, 'status:free');

            output.should.have.keys('html', 'plaintext', 'otherProperty');
            output.html.should.eql('<div>test</div>');
            output.plaintext.should.eql('test');
            output.otherProperty.should.eql(true); // Make sure to keep other properties
        });

        it('should hide non matching member segments', function () {
            const email = {
                otherProperty: true,
                html: 'hello<div data-gh-segment="status:free"> free users!</div><div data-gh-segment="status:-free"> paid users!</div>',
                plaintext: 'test'
            };
            Object.freeze(email); // Make sure we don't modify `email`

            let output = renderEmailForSegment(email, 'status:free');

            output.should.have.keys('html', 'plaintext', 'otherProperty');
            output.html.should.eql('hello<div> free users!</div>');
            output.plaintext.should.eql('hello free users!');

            output = renderEmailForSegment(email, 'status:-free');

            output.should.have.keys('html', 'plaintext', 'otherProperty');
            output.html.should.eql('hello<div> paid users!</div>');
            output.plaintext.should.eql('hello paid users!');
        });

        it('should hide all segments when the segment filter is empty', function () {
            const email = {
                otherProperty: true,
                html: 'hello<div data-gh-segment="status:free"> free users!</div><div data-gh-segment="status:-free"> paid users!</div>',
                plaintext: 'test'
            };

            let output = renderEmailForSegment(email, null);
            output.html.should.equal('hello');
            output.plaintext.should.equal('hello');
        });

        it('should show paywall content for free members on paid posts', function () {
            sinon.stub(urlService, 'getUrlByResourceId').returns('https://site.com/blah/');
            sinon.stub(labs, 'isSet').returns(true);
            const email = {
                post: {
                    status: 'published',
                    visibility: 'paid'
                },
                html: '<p>Free content</p><!--members-only--><p>Members content</p>',
                plaintext: 'Free content. Members content'
            };

            let output = renderEmailForSegment(email, 'status:free');
            output.html.should.containEql(`<p>Free content</p>`);
            output.html.should.containEql(`Subscribe to`);
            output.html.should.containEql(`https://site.com/blah/#/portal/signup`);
            output.html.should.not.containEql(`<p>Members content</p>`);

            output.plaintext.should.containEql(`Free content`);
            output.plaintext.should.containEql(`Subscribe to`);
            output.plaintext.should.containEql(`https://site.com/blah/#/portal/signup`);
            output.plaintext.should.not.containEql(`Members content`);
        });

        it('should show full cta for paid members on paid posts', function () {
            sinon.stub(urlService, 'getUrlByResourceId').returns('https://site.com/blah/');
            sinon.stub(labs, 'isSet').returns(true);
            const email = {
                post: {
                    status: 'published',
                    visibility: 'paid'
                },
                html: '<p>Free content</p><!--members-only--><p>Members content</p>',
                plaintext: 'Free content. Members content'
            };

            let output = renderEmailForSegment(email, 'status:-free');
            output.html.should.equal(`<p>Free content</p><!--members-only--><p>Members content</p>`);
            output.plaintext.should.equal(`Free content\n\nMembers content`);
        });

        it('should show paywall content for free members on specific tier posts', function () {
            sinon.stub(urlService, 'getUrlByResourceId').returns('https://site.com/blah/');
            sinon.stub(labs, 'isSet').returns(true);
            const email = {
                post: {
                    status: 'published',
                    visibility: 'tiers'
                },
                html: '<p>Free content</p><!--members-only--><p>Members content</p>',
                plaintext: 'Free content. Members content'
            };

            let output = renderEmailForSegment(email, 'status:free');
            output.html.should.containEql(`<p>Free content</p>`);
            output.html.should.containEql(`Subscribe to`);
            output.html.should.containEql(`https://site.com/blah/#/portal/signup`);
            output.html.should.not.containEql(`<p>Members content</p>`);

            output.plaintext.should.containEql(`Free content`);
            output.plaintext.should.containEql(`Subscribe to`);
            output.plaintext.should.containEql(`https://site.com/blah/#/portal/signup`);
            output.plaintext.should.not.containEql(`Members content`);
        });

        it('should show full cta for paid members on specific tier posts', function () {
            sinon.stub(urlService, 'getUrlByResourceId').returns('https://site.com/blah/');
            sinon.stub(labs, 'isSet').returns(true);
            const email = {
                post: {
                    status: 'published',
                    visibility: 'paid'
                },
                html: '<p>Free content</p><!--members-only--><p>Members content</p>',
                plaintext: 'Free content. Members content'
            };

            let output = renderEmailForSegment(email, 'status:-free');
            output.html.should.equal(`<p>Free content</p><!--members-only--><p>Members content</p>`);
            output.plaintext.should.equal(`Free content\n\nMembers content`);
        });

        it('should show full content for free members on free posts', function () {
            sinon.stub(urlService, 'getUrlByResourceId').returns('https://site.com/blah/');
            sinon.stub(labs, 'isSet').returns(true);
            const email = {
                post: {
                    status: 'published',
                    visibility: 'public'
                },
                html: '<p>Free content</p><!--members-only--><p>Members content</p>',
                plaintext: 'Free content. Members content'
            };

            let output = renderEmailForSegment(email, 'status:free');
            output.html.should.equal(`<p>Free content</p><!--members-only--><p>Members content</p>`);
            output.plaintext.should.equal(`Free content\n\nMembers content`);
        });

        it('should show full content for paid members on free posts', function () {
            sinon.stub(urlService, 'getUrlByResourceId').returns('https://site.com/blah/');
            sinon.stub(labs, 'isSet').returns(true);
            const email = {
                post: {
                    status: 'published',
                    visibility: 'public'
                },
                html: '<p>Free content</p><!--members-only--><p>Members content</p>',
                plaintext: 'Free content. Members content'
            };

            let output = renderEmailForSegment(email, 'status:-free');
            output.html.should.equal(`<p>Free content</p><!--members-only--><p>Members content</p>`);
            output.plaintext.should.equal(`Free content\n\nMembers content`);
        });

        it('should not crash on missing post for email with paywall', function () {
            sinon.stub(urlService, 'getUrlByResourceId').returns('https://site.com/blah/');
            sinon.stub(labs, 'isSet').returns(true);
            const email = {
                html: '<p>Free content</p><!--members-only--><p>Members content</p>',
                plaintext: 'Free content. Members content'
            };

            let output = renderEmailForSegment(email, 'status:-free');
            output.html.should.equal(`<p>Free content</p><!--members-only--><p>Members content</p>`);
            output.plaintext.should.equal(`Free content\n\nMembers content`);
        });
    });

    describe('createUnsubscribeUrl', function () {
        before(function () {
            models.init();
        });

        afterEach(function () {
            sinon.restore();
        });

        it('generates unsubscribe url for preview', function () {
            sinon.stub(urlUtils, 'getSiteUrl').returns('https://site.com/blah');
            const unsubscribeUrl = createUnsubscribeUrl(null);
            unsubscribeUrl.should.eql('https://site.com/blah/unsubscribe/?preview=1');
        });

        it('generates unsubscribe url with only member uuid', function () {
            sinon.stub(urlUtils, 'getSiteUrl').returns('https://site.com/blah');
            const unsubscribeUrl = createUnsubscribeUrl('member-abcd');
            unsubscribeUrl.should.eql('https://site.com/blah/unsubscribe/?uuid=member-abcd');
        });

        it('generates unsubscribe url with both post and newsletter uuid', function () {
            sinon.stub(urlUtils, 'getSiteUrl').returns('https://site.com/blah');
            const unsubscribeUrl = createUnsubscribeUrl('member-abcd', {newsletterUuid: 'newsletter-abcd'});
            unsubscribeUrl.should.eql('https://site.com/blah/unsubscribe/?uuid=member-abcd&newsletter=newsletter-abcd');
        });

        it('generates unsubscribe url with comments', function () {
            sinon.stub(urlUtils, 'getSiteUrl').returns('https://site.com/blah');
            const unsubscribeUrl = createUnsubscribeUrl('member-abcd', {comments: true});
            unsubscribeUrl.should.eql('https://site.com/blah/unsubscribe/?uuid=member-abcd&comments=1');
        });
    });

    describe('createPostSignupUrl', function () {
        before(function () {
            models.init();
        });

        afterEach(function () {
            sinon.restore();
        });

        it('generates signup url on post for published post', function () {
            sinon.stub(urlService, 'getUrlByResourceId').returns('https://site.com/blah/');
            const unsubscribeUrl = createPostSignupUrl({
                status: 'published',
                id: 'abc123'
            });
            unsubscribeUrl.should.eql('https://site.com/blah/#/portal/signup');
        });

        it('generates signup url on homepage for email only post', function () {
            sinon.stub(urlService, 'getUrlByResourceId').returns('https://site.com/test/404/');
            sinon.stub(urlUtils, 'getSiteUrl').returns('https://site.com/test/');
            const unsubscribeUrl = createPostSignupUrl({
                status: 'sent',
                id: 'abc123'
            });
            unsubscribeUrl.should.eql('https://site.com/test/#/portal/signup');
        });
    });

    describe('getTemplateSettings', function () {
        before(function () {
            models.init();
        });

        afterEach(function () {
            sinon.restore();
        });

        it('uses the newsletter settings', async function () {
            sinon.stub(settingsCache, 'get').callsFake(function (key) {
                return {
                    icon: 'icon2',
                    accent_color: '#000099'
                }[key];
            });
            const newsletterMock = {
                get: function (key) {
                    return {
                        header_image: 'image',
                        show_header_icon: true,
                        show_header_title: true,
                        show_feature_image: true,
                        title_font_category: 'sans-serif',
                        title_alignment: 'center',
                        body_font_category: 'serif',
                        show_badge: true,
                        footer_content: 'footer',
                        show_header_name: true
                    }[key];
                }
            };
            const res = await _getTemplateSettings(newsletterMock);
            should(res).eql({
                headerImage: 'image',
                showHeaderIcon: 'icon2',
                showHeaderTitle: true,
                showFeatureImage: true,
                titleFontCategory: 'sans-serif',
                titleAlignment: 'center',
                bodyFontCategory: 'serif',
                showBadge: true,
                footerContent: 'footer',
                accentColor: '#000099',
                adjustedAccentColor: '#000099',
                adjustedAccentContrastColor: '#FFFFFF',
                showHeaderName: true
            });
        });
    });
});
