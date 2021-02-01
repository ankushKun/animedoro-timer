
function openNav() {
    document.querySelector(".sidenav").style.width = "200px";
    document.querySelector("main").style.marginLeft = "200px";
    document.querySelector("header").style.marginLeft = "200px";
    document.querySelector(".openbtn").style.visibility = "hidden";
}


function closeNav() {
    document.querySelector(".sidenav").style.width = "0px";
    document.querySelector("main").style.marginLeft = "0px";
    document.querySelector("header").style.marginLeft = "0px";
    document.querySelector(".openbtn").style.visibility = "visible";
}

openNav();
