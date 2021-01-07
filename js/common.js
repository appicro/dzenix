/*!
 * Theia Sticky Sidebar v1.7.0
 * https://github.com/WeCodePixels/theia-sticky-sidebar
 *
 * Glues your website's sidebars, making them permanently visible while scrolling.
 *
 * Copyright 2013-2016 WeCodePixels and other contributors
 * Released under the MIT license
 */

(function ($) {
    $.fn.theiaStickySidebar = function (options) {
        var defaults = {
            'containerSelector': '',
            'additionalMarginTop': 0,
            'additionalMarginBottom': 0,
            'updateSidebarHeight': true,
            'minWidth': 0,
            'disableOnResponsiveLayouts': true,
            'sidebarBehavior': 'modern',
            'defaultPosition': 'relative',
            'namespace': 'TSS'
        };
        options = $.extend(defaults, options);

        // Validate options
        options.additionalMarginTop = parseInt(options.additionalMarginTop) || 0;
        options.additionalMarginBottom = parseInt(options.additionalMarginBottom) || 0;

        tryInitOrHookIntoEvents(options, this);

        // Try doing init, otherwise hook into window.resize and document.scroll and try again then.
        function tryInitOrHookIntoEvents(options, $that) {
            var success = tryInit(options, $that);

            if (!success) {
                console.log('TSS: Body width smaller than options.minWidth. Init is delayed.');

                $(document).on('scroll.' + options.namespace, function (options, $that) {
                    return function (evt) {
                        var success = tryInit(options, $that);

                        if (success) {
                            $(this).unbind(evt);
                        }
                    };
                }(options, $that));
                $(window).on('resize.' + options.namespace, function (options, $that) {
                    return function (evt) {
                        var success = tryInit(options, $that);

                        if (success) {
                            $(this).unbind(evt);
                        }
                    };
                }(options, $that))
            }
        }

        // Try doing init if proper conditions are met.
        function tryInit(options, $that) {
            if (options.initialized === true) {
                return true;
            }

            if ($('body').width() < options.minWidth) {
                return false;
            }

            init(options, $that);

            return true;
        }

        // Init the sticky sidebar(s).
        function init(options, $that) {
            options.initialized = true;

            // Add CSS
            var existingStylesheet = $('#theia-sticky-sidebar-stylesheet-' + options.namespace);
            if (existingStylesheet.length === 0) {
                $('head').append($('<style id="theia-sticky-sidebar-stylesheet-' + options.namespace + '">.theiaStickySidebar:after {content: ""; display: table; clear: both;}</style>'));
            }

            $that.each(function () {
                var o = {};

                o.sidebar = $(this);

                // Save options
                o.options = options || {};

                // Get container
                o.container = $(o.options.containerSelector);
                if (o.container.length == 0) {
                    o.container = o.sidebar.parent();
                }

                // Create sticky sidebar
                o.sidebar.parents().css('-webkit-transform', 'none'); // Fix for WebKit bug - https://code.google.com/p/chromium/issues/detail?id=20574
                o.sidebar.css({
                    'position': o.options.defaultPosition,
                    'overflow': 'visible',
                    // The "box-sizing" must be set to "content-box" because we set a fixed height to this element when the sticky sidebar has a fixed position.
                    '-webkit-box-sizing': 'border-box',
                    '-moz-box-sizing': 'border-box',
                    'box-sizing': 'border-box'
                });

                // Get the sticky sidebar element. If none has been found, then create one.
                o.stickySidebar = o.sidebar.find('.theiaStickySidebar');
                if (o.stickySidebar.length == 0) {
                    // Remove <script> tags, otherwise they will be run again when added to the stickySidebar.
                    var javaScriptMIMETypes = /(?:text|application)\/(?:x-)?(?:javascript|ecmascript)/i;
                    o.sidebar.find('script').filter(function (index, script) {
                        return script.type.length === 0 || script.type.match(javaScriptMIMETypes);
                    }).remove();

                    o.stickySidebar = $('<div>').addClass('theiaStickySidebar').append(o.sidebar.children());
                    o.sidebar.append(o.stickySidebar);
                }

                // Get existing top and bottom margins and paddings
                o.marginBottom = parseInt(o.sidebar.css('margin-bottom'));
                o.paddingTop = parseInt(o.sidebar.css('padding-top'));
                o.paddingBottom = parseInt(o.sidebar.css('padding-bottom'));

                // Add a temporary padding rule to check for collapsable margins.
                var collapsedTopHeight = o.stickySidebar.offset().top;
                var collapsedBottomHeight = o.stickySidebar.outerHeight();
                o.stickySidebar.css('padding-top', 1);
                o.stickySidebar.css('padding-bottom', 1);
                collapsedTopHeight -= o.stickySidebar.offset().top;
                collapsedBottomHeight = o.stickySidebar.outerHeight() - collapsedBottomHeight - collapsedTopHeight;
                if (collapsedTopHeight == 0) {
                    o.stickySidebar.css('padding-top', 0);
                    o.stickySidebarPaddingTop = 0;
                }
                else {
                    o.stickySidebarPaddingTop = 1;
                }

                if (collapsedBottomHeight == 0) {
                    o.stickySidebar.css('padding-bottom', 0);
                    o.stickySidebarPaddingBottom = 0;
                }
                else {
                    o.stickySidebarPaddingBottom = 1;
                }

                // We use this to know whether the user is scrolling up or down.
                o.previousScrollTop = null;

                // Scroll top (value) when the sidebar has fixed position.
                o.fixedScrollTop = 0;

                // Set sidebar to default values.
                resetSidebar();

                o.onScroll = function (o) {
                    // Stop if the sidebar isn't visible.
                    if (!o.stickySidebar.is(":visible")) {
                        return;
                    }

                    // Stop if the window is too small.
                    if ($('body').width() < o.options.minWidth) {
                        resetSidebar();
                        return;
                    }

                    // Stop if the sidebar width is larger than the container width (e.g. the theme is responsive and the sidebar is now below the content)
                    if (o.options.disableOnResponsiveLayouts) {
                        var sidebarWidth = o.sidebar.outerWidth(o.sidebar.css('float') == 'none');

                        if (sidebarWidth + 50 > o.container.width()) {
                            resetSidebar();
                            return;
                        }
                    }

                    var scrollTop = $(document).scrollTop();
                    var position = 'static';

                    // If the user has scrolled down enough for the sidebar to be clipped at the top, then we can consider changing its position.
                    if (scrollTop >= o.sidebar.offset().top + (o.paddingTop - o.options.additionalMarginTop)) {
                        // The top and bottom offsets, used in various calculations.
                        var offsetTop = o.paddingTop + options.additionalMarginTop;
                        var offsetBottom = o.paddingBottom + o.marginBottom + options.additionalMarginBottom;

                        // All top and bottom positions are relative to the window, not to the parent elemnts.
                        var containerTop = o.sidebar.offset().top;
                        var containerBottom = o.sidebar.offset().top + getClearedHeight(o.container);

                        // The top and bottom offsets relative to the window screen top (zero) and bottom (window height).
                        var windowOffsetTop = 0 + options.additionalMarginTop;
                        var windowOffsetBottom;

                        var sidebarSmallerThanWindow = (o.stickySidebar.outerHeight() + offsetTop + offsetBottom) < $(window).height();
                        if (sidebarSmallerThanWindow) {
                            windowOffsetBottom = windowOffsetTop + o.stickySidebar.outerHeight();
                        }
                        else {
                            windowOffsetBottom = $(window).height() - o.marginBottom - o.paddingBottom - options.additionalMarginBottom;
                        }

                        var staticLimitTop = containerTop - scrollTop + o.paddingTop;
                        var staticLimitBottom = containerBottom - scrollTop - o.paddingBottom - o.marginBottom;

                        var top = o.stickySidebar.offset().top - scrollTop;
                        var scrollTopDiff = o.previousScrollTop - scrollTop;

                        // If the sidebar position is fixed, then it won't move up or down by itself. So, we manually adjust the top coordinate.
                        if (o.stickySidebar.css('position') == 'fixed') {
                            if (o.options.sidebarBehavior == 'modern') {
                                top += scrollTopDiff;
                            }
                        }

                        if (o.options.sidebarBehavior == 'stick-to-top') {
                            top = options.additionalMarginTop;
                        }

                        if (o.options.sidebarBehavior == 'stick-to-bottom') {
                            top = windowOffsetBottom - o.stickySidebar.outerHeight();
                        }

                        if (scrollTopDiff > 0) { // If the user is scrolling up.
                            top = Math.min(top, windowOffsetTop);
                        }
                        else { // If the user is scrolling down.
                            top = Math.max(top, windowOffsetBottom - o.stickySidebar.outerHeight());
                        }

                        top = Math.max(top, staticLimitTop);

                        top = Math.min(top, staticLimitBottom - o.stickySidebar.outerHeight());

                        // If the sidebar is the same height as the container, we won't use fixed positioning.
                        var sidebarSameHeightAsContainer = o.container.height() == o.stickySidebar.outerHeight();

                        if (!sidebarSameHeightAsContainer && top == windowOffsetTop) {
                            position = 'fixed';
                        }
                        else if (!sidebarSameHeightAsContainer && top == windowOffsetBottom - o.stickySidebar.outerHeight()) {
                            position = 'fixed';
                        }
                        else if (scrollTop + top - o.sidebar.offset().top - o.paddingTop <= options.additionalMarginTop) {
                            // Stuck to the top of the page. No special behavior.
                            position = 'static';
                        }
                        else {
                            // Stuck to the bottom of the page.
                            position = 'absolute';
                        }
                    }

                    /*
                     * Performance notice: It's OK to set these CSS values at each resize/scroll, even if they don't change.
                     * It's way slower to first check if the values have changed.
                     */
                    if (position == 'fixed') {
                        var scrollLeft = $(document).scrollLeft();

                        o.stickySidebar.css({
                            'position': 'fixed',
                            'width': getWidthForObject(o.stickySidebar) + 'px',
                            'transform': 'translateY(' + top + 'px)',
                            'left': (o.sidebar.offset().left + parseInt(o.sidebar.css('padding-left')) - scrollLeft) + 'px',
                            'top': '0px'
                        });
                    }
                    else if (position == 'absolute') {
                        var css = {};

                        if (o.stickySidebar.css('position') != 'absolute') {
                            css.position = 'absolute';
                            css.transform = 'translateY(' + (scrollTop + top - o.sidebar.offset().top - o.stickySidebarPaddingTop - o.stickySidebarPaddingBottom) + 'px)';
                            css.top = '0px';
                        }

                        css.width = getWidthForObject(o.stickySidebar) + 'px';
                        css.left = '';

                        o.stickySidebar.css(css);
                    }
                    else if (position == 'static') {
                        resetSidebar();
                    }

                    if (position != 'static') {
                        if (o.options.updateSidebarHeight == true) {
                            o.sidebar.css({
                                'min-height': o.stickySidebar.outerHeight() + o.stickySidebar.offset().top - o.sidebar.offset().top + o.paddingBottom
                            });
                        }
                    }

                    o.previousScrollTop = scrollTop;
                };

                // Initialize the sidebar's position.
                o.onScroll(o);

                // Recalculate the sidebar's position on every scroll and resize.
                $(document).on('scroll.' + o.options.namespace, function (o) {
                    return function () {
                        o.onScroll(o);
                    };
                }(o));
                $(window).on('resize.' + o.options.namespace, function (o) {
                    return function () {
                        o.stickySidebar.css({'position': 'static'});
                        o.onScroll(o);
                    };
                }(o));

                // Recalculate the sidebar's position every time the sidebar changes its size.
                if (typeof ResizeSensor !== 'undefined') {
                    new ResizeSensor(o.stickySidebar[0], function (o) {
                        return function () {
                            o.onScroll(o);
                        };
                    }(o));
                }

                // Reset the sidebar to its default state
                function resetSidebar() {
                    o.fixedScrollTop = 0;
                    o.sidebar.css({
                        'min-height': '1px'
                    });
                    o.stickySidebar.css({
                        'position': 'static',
                        'width': '',
                        'transform': 'none'
                    });
                }

                // Get the height of a div as if its floated children were cleared. Note that this function fails if the floats are more than one level deep.
                function getClearedHeight(e) {
                    var height = e.height();

                    e.children().each(function () {
                        height = Math.max(height, $(this).height());
                    });

                    return height;
                }
            });
        }

        function getWidthForObject(object) {
            var width;

            try {
                width = object[0].getBoundingClientRect().width;
            }
            catch (err) {
            }

            if (typeof width === "undefined") {
                width = object.width();
            }

            return width;
        }

        return this;
    }
})(jQuery);


var $accordionBtn = $(".js-accordion").find(".js-accordion-btn"),
    $accordionDetail = $accordionBtn.next(".js-accordion-content");
$(".js-accordion").find(".js-accordion-btn.open").next(".js-accordion-content").show(), $accordionBtn.on("click",
    function () {
        $(this).hasClass("open") ? ($(this).removeClass("open"), $(this).closest(".js-accordion").find(
            ".js-accordion-content").stop().slideUp(300)) : ($(this).addClass("open"), $(this).closest(
            ".js-accordion").find(".js-accordion-content").stop().slideDown(300))
    });
var pulldown = $(".page-area-linkbox").find(".page-area-linkbox__list:first");
    $maskBg = $('.mrvll-nav-blackout');
    $('.dznav').hover(
        function () {
            var $this = $(this);
                $maskBg.addClass('open');
            $(this).find('.nav-navigation').addClass('menu-open');
        },
        function () {
            var $this = $(this);
                $maskBg.removeClass('open');
            $(this).find('.nav-navigation').removeClass('menu-open');
           
     },   
    );


   jQuery(function() {
    jQuery('.filter-collection-left > a').on('click', function(){
      jQuery('.wrapper').addClass('show-fillter');
    }
                                            );
    jQuery(document).mouseup(function (e){

      var container = jQuery("#filter-sidebar");

      if (!container.is(e.target) // if the target of the click isn't the container...
          && container.has(e.target).length === 0) // ... nor a descendant of the container
      {
        jQuery('.wrapper').removeClass('show-fillter');
      }
    });
   jQuery('.close-sidebar-collection').click(function(){
  		jQuery('.wrapper').removeClass('show-fillter');
  });
  });

(function ($) {
    var slider = $('#product-slider'), //slider
        sliderNav = '.js-product-slider-nav', // slider nav
        prev = null, // Prev btn
        next = null; // Next btn
    slider.slick({
        dots: false,
        arrows: false,
        infinite: false,
        speed: 500,
        slidesToShow: 1,
        autoplay: false,
        autoplaySpeed: 4000,
        slidesToScroll: 1,
        nextArrow: '<button type="button" class="slick-next icon-next">Next</button>',
        prevArrow: '<button type="button" class="slick-prev icon-next">Previous</button>'
    });
    $(sliderNav).on('click', function() {
        slider.slick('slickGoTo', $(this).attr('data-target'))
    })

    slider.on('beforeChange', function(event, slick, currentSlide, nextSlide){
        $(sliderNav).each(function(){
            $(this).removeClass('active-slide')
        })
        $(sliderNav + '[data-target="' + nextSlide + '"]').addClass('active-slide')
    });
})(jQuery);
(function ($) {
    var slider = $('#home-showroom-slider')
    slider.slick({
        dots: true,
        arrows: false,
        infinite: false,
        speed: 500,
        slidesToShow: 2,
        autoplay: false,
        autoplaySpeed: 4000,
        slidesToScroll: 2,
        appendDots: $('#home-showroom-slider-dots'),
        responsive: [
    {
      breakpoint: 1024,
      settings: {
        slidesToShow: 3,
        slidesToScroll: 3,
        infinite: true,
        dots: true
      }
    },
    {
      breakpoint: 600,
      settings: {
        slidesToShow: 1,
        slidesToScroll: 1
      }
    },
    {
      breakpoint: 480,
      settings: {
        slidesToShow: 1,
        slidesToScroll: 1
      }
    }
    // You can unslick at a given breakpoint now by adding:
    // settings: "unslick"
    // instead of a settings object
  ]
    });

})(jQuery);
(function ($) {
    var slider = $('.sigma_banner-slider')
    slider.slick({
         dots: false,    
  infinite: true,
  speed: 300,
  slidesToShow: 1,
        autoplay: ture,
        autoplaySpeed: 2000,	    
  nextArrow: '.slider-next',
  prevArrow: '.slider-prev',
    });

})(jQuery);

		$(document).ready(function() {
			$('.leftSidebar')
				.theiaStickySidebar({
					additionalMarginTop: 150
				});
		});  

AnmlNavigation.prototype.menuOpenClass = "menu-open";
AnmlNavigation.prototype.screenOpenClass = "screen-open";
AnmlNavigation.prototype.filterSelectedClass = "filter-selected";
AnmlNavigation.prototype.currentItemClass = "current-item";
AnmlNavigation.prototype.navigation = "mrvll-navigation";
AnmlNavigation.prototype.navItemClass = "mrvll-nav-item";
AnmlNavigation.prototype.toggleIconClass = "mrvll-nav-icon-toggle";
AnmlNavigation.prototype.menuClass = "mrvll-menu";
AnmlNavigation.prototype.menuCategoryClass = "mrvll-menu-category";
AnmlNavigation.prototype.secondScreenClass = "mrvll-menu-second-screen";
AnmlNavigation.prototype.secondScreenItemClass = "mrvll-menu-second-screen-item";
AnmlNavigation.prototype.navPopupGlobeClass = "mrvll-menu-lang";
AnmlNavigation.prototype.navIconGlobeClass = "mrvll-nav-icon-lang";
AnmlNavigation.prototype.navPopupSearchClass = "mrvll-menu-search";
AnmlNavigation.prototype.navIconSearchClass = "mrvll-nav-icon-search";
AnmlNavigation.prototype.blackoutClass = "mrvll-nav-blackout";
AnmlNavigation.prototype.animatedIcon = "animated-toggle-icon";
AnmlNavigation.prototype.mobileTopLinks = ".mrvll-menu-first-screen .mrvll-menu-mobile-toplinks li";
AnmlNavigation.prototype.mobileBackLinks = ".mrvll-menu-second-screen .mrvll-menu-mobile-toplinks li";
AnmlNavigation.prototype.mobileProductFilters = ".mrvll-menu-product-filters li";
AnmlNavigation.prototype.blackout = {};
AnmlNavigation.prototype.menuOpen = false;
AnmlNavigation.prototype.currentItemName = "";
AnmlNavigation.prototype.mobileMenuToggleBtn = {};
AnmlNavigation.prototype.navWrapper = {};
AnmlNavigation.prototype.init = function () {

    // Assignments
    var _this = this;
    this.mobileMenuToggleBtn = $("." + this.toggleIconClass);
    this.mainNavItems = $("." + this.navItemClass);
    this.navWrapper = $("." + this.navigation);
    this.blackout = $("." + this.blackoutClass);
    // Mobile Menu Toggle Button Click Event Handler
    $(this.mobileMenuToggleBtn).on('click', function () {
        (_this.menuOpen = !_this.menuOpen) ? _this.openMenu() : _this.closeMenu(true);
    });

    // Nav Item Click Event Handler

    // Clicking anything other than a nav item or the visible
    // menu, will close the menu
 


    // Mobile Menu Click Handlers
    $(this.mobileTopLinks).on('click', this.mobileTopLinkClickHandler.bind(this));
    $(this.mobileBackLinks).on('click', this.mobileTopLinkBackClickHandler.bind(this));
    $(this.mobileProductFilters).on('click', this.productFiltersClickHandler.bind(this));

    // Popups
    $("." + this.navIconGlobeClass).on('click', this.globeClickHandler.bind(this));
    $("." + this.navIconSearchClass).on('click', this.searchClickHandler.bind(this));

};

AnmlNavigation.prototype.globeClickHandler = function (e) {
    if ($("." + this.navPopupGlobeClass).hasClass('open')) {
        $("." + this.navPopupGlobeClass).removeClass('open');
        this.blackout.removeClass('open');
        $("." + this.navIconGlobeClass).removeClass('selected');
    } else {
        $("." + this.navPopupGlobeClass).addClass('open');
        this.blackout.addClass('open');
        $("." + this.navIconGlobeClass).addClass('selected');
    }
    $("." + this.navPopupSearchClass).removeClass('open');
    $("." + this.navIconSearchClass).removeClass('selected');
};

AnmlNavigation.prototype.searchClickHandler = function (e) {

    if ($("." + this.navPopupSearchClass).hasClass('open')) {
        $("." + this.navPopupSearchClass).removeClass('open');
        $("." + this.navPopupSearchClass + " input").focusout();
        this.blackout.removeClass('open');
        $("." + this.navIconSearchClass).removeClass('selected');
    } else {
        $("." + this.navPopupSearchClass).addClass('open');
        $("." + this.navPopupSearchClass + " input").focus();
        this.blackout.addClass('open');
        $("." + this.navIconSearchClass).addClass('selected');
    }
    $("." + this.navPopupGlobeClass).removeClass('open');
    $("." + this.navIconGlobeClass).removeClass('selected');
};


AnmlNavigation.prototype.navItemClickHandler = function (e) {

    var _this = this;
    var clickedItemName = $(e.target).data('item');
    var clickedItem = $(e.target)[0];

    if (!_this.menuOpen || _this.currentItemName !== clickedItemName) {
        _this.openMenu(clickedItemName, clickedItem);
    } else {
        // Close menu, because current item was clicked again
        _this.closeMenu(true);
    }

    this.unselectIcons();

};

AnmlNavigation.prototype.unselectIcons = function () {
    $("." + this.navIconSearchClass).removeClass('selected');
    $("." + this.navIconGlobeClass).removeClass('selected');
};

AnmlNavigation.prototype.bodyClickHandler = function (e) {

    if (!$(e.target).parents("." + this.navItemClass).length
        && !$(e.target).hasClass(this.navItemClass)
        && !$(e.target).hasClass(this.toggleIconClass)
        && !$(e.target).hasClass(this.animatedIcon)
        && !$(e.target).parents("."+this.animatedIcon).length
        && !$(e.target).parents('.' + this.menuClass).length
        && !$(e.target).hasClass(this.menuClass)) {

        if ($(e.target).hasClass(this.blackoutClass)) {
            this.closeMenu(true);
        } else {
            this.closeMenu(false);
        }
    }
};

AnmlNavigation.prototype.openMenu = function (clickedItemName, clickedItem) {
    this.menuOpen = true;
    this.navWrapper.addClass(this.menuOpenClass);
    $("."+this.animatedIcon).addClass('open');
    if (clickedItemName) {
        this.selectItem(clickedItemName, clickedItem);
    }

    $("." + this.navPopupSearchClass).removeClass('open');
    $("." + this.navPopupGlobeClass).removeClass('open');

    this.unselectIcons();
    $('html').addClass('noScroll');
};


AnmlNavigation.prototype.closeMenu = function (closeAllMenus) {
    this.menuOpen = false;
    this.navWrapper.removeClass(this.menuOpenClass);
    $("."+this.animatedIcon).removeClass('open');
    this.selectItem("");
    $("." + this.secondScreenClass).removeClass(this.screenOpenClass);
    if (closeAllMenus) {
        this.blackout.removeClass('open');
        this.unselectIcons();
        $("." + this.navPopupGlobeClass).removeClass('open');
        $("." + this.navPopupSearchClass).removeClass('open');
    }
    $('html').removeClass('noScroll');
};

AnmlNavigation.prototype.selectItem = function (itemName, item) {

    var _this = this;

    _this.currentItemName = itemName;
    _this.deselectOtherItems(itemName);
    if (item) {
        $(item).addClass(_this.currentItemClass);
    }

    $("." + this.menuCategoryClass).each(function () {
        if ($(this).data('item') === itemName) {
            $(this).addClass(_this.currentItemClass);
        }
    });

    $("." + this.secondScreenItemClass).each(function () {
        if ($(this).data('item') === itemName) {
            console.log(this);
            console.log($(this).data('item'));
            console.log(_this.currentItemClass);
            $(this).addClass(_this.currentItemClass);
        }
    });

};

AnmlNavigation.prototype.deselectOtherItems = function (itemName) {

    var _this = this;

    $("." + this.navItemClass).each(function () {
        if ($(this).data('item') !== itemName) {
            $(this).removeClass(_this.currentItemClass);
        }
    });

    $("." + this.menuCategoryClass).each(function () {
        if ($(this).data('item') !== itemName) {
            $(this).removeClass(_this.currentItemClass);
        }
    });

    $("." + this.secondScreenItemClass).each(function () {
        if ($(this).data('item') !== itemName) {
            $(this).removeClass(_this.currentItemClass);
        }
    });

};


AnmlNavigation.prototype.showNextScreen = function (itemName) {

    if (itemName) {
        this.selectItem(itemName);
    }

    console.log("showNextScreen");

    console.log(this.screenOpenClass);
    $("." + this.secondScreenClass).addClass(this.screenOpenClass);
};

AnmlNavigation.prototype.updateProductFilter = function (itemName) {

    var _this = this;

    $(".mrvll-menu-product-filters li").each(function () {
        if ($(this).data('item') !== itemName) {
            $(this).removeClass(_this.filterSelectedClass);
        } else {
            $(this).addClass(_this.filterSelectedClass);
        }
    });

    $(".mrvll-menu-filter-content").each(function () {
        if ($(this).data('item') === itemName) {
            $(this).addClass(_this.filterSelectedClass);
        } else {
            $(this).removeClass(_this.filterSelectedClass);
        }
    })

};

AnmlNavigation.prototype.hideNextScreen = function () {
    $("." + this.secondScreenClass).removeClass(this.screenOpenClass);
};

AnmlNavigation.prototype.mobileTopLinkClickHandler = function (e) {

    var clickedItemName = $(e.target).data('item');
    this.showNextScreen(clickedItemName);

};

AnmlNavigation.prototype.mobileTopLinkBackClickHandler = function (e) {
    this.hideNextScreen();
};

AnmlNavigation.prototype.productFiltersClickHandler = function (e) {
    var clickedItemName = $(e.target).data('item');
    this.updateProductFilter(clickedItemName);
};

function AnmlNavigation() {
    this.init();
}

$(document).ready(function () {

    var anmlNavigation = new AnmlNavigation();

});


    $( ".animated-toggle-icon" ).on( "click", function() {
        $(this).toggleClass('yes');

        if ($(this).hasClass("yes")){
			console.log('has class open');
            
          
           
           
        }else{
			console.log('no class');
            $(".covid-banner-body .mrvll-navigation .mrvll-menu").css({ 'height': '0' });
        }

    });









