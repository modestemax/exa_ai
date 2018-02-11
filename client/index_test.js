send = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function () {
    debugger;
    onreadystatechange = this.onreadystatechange;
    this.onreadystatechange = function () {
        debugger;
        onreadystatechange && onreadystatechange.apply(this, arguments)
    };
    send.apply(this, arguments);
}