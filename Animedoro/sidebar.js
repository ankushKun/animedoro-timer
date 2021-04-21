
const width = "250px";

function openNav() {
    document.querySelector(".sidenav").style.width = width;
    document.querySelector("main").style.marginLeft = width;
    document.querySelector("header").style.marginLeft = width;
    document.querySelector(".openbtn").style.visibility = "hidden";
}


function closeNav() {
    document.querySelector(".sidenav").style.width = "0px";
    document.querySelector("main").style.marginLeft = "0px";
    document.querySelector("header").style.marginLeft = "0px";
    document.querySelector(".openbtn").style.visibility = "visible";
}

closeNav();
